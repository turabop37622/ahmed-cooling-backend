const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Invoice = require('../models/Invoice');
const Booking = require('../models/Booking');
const { body, validationResult } = require('express-validator');

// Create invoice
router.post('/', auth, [
  body('bookingId').notEmpty().withMessage('Booking ID is required'),
  body('items').isArray().withMessage('Items must be an array'),
  body('subtotal').isNumeric().withMessage('Subtotal must be a number'),
  body('totalAmount').isNumeric().withMessage('Total amount must be a number')
], async (req, res) => {
  try {
    // Check if user is admin or technician
    if (req.user.role !== 'admin' && req.user.role !== 'technician') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { bookingId, items, subtotal, tax = 0, discount = 0, totalAmount, notes } = req.body;

    // Check if booking exists and is completed
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Invoice can only be created for completed bookings'
      });
    }

    // Check if invoice already exists for this booking
    const existingInvoice = await Invoice.findOne({ booking: bookingId });
    if (existingInvoice) {
      return res.status(400).json({
        success: false,
        message: 'Invoice already exists for this booking'
      });
    }

    // Create invoice
    const invoice = new Invoice({
      booking: bookingId,
      customer: booking.user,
      technician: booking.technician,
      items,
      subtotal,
      tax,
      discount,
      totalAmount,
      dueAmount: totalAmount,
      notes,
      status: 'sent'
    });

    await invoice.save();

    // Update booking with final cost
    booking.finalCost = totalAmount;
    await booking.save();

    // Populate invoice with related data
    await invoice.populate('booking', 'orderNumber scheduledDate');
    await invoice.populate('customer', 'name email phone address');
    await invoice.populate('technician', 'name phone');

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      invoice
    });

  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get invoice
router.get('/:id', auth, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('booking', 'orderNumber scheduledDate service')
      .populate('customer', 'name email phone address')
      .populate('technician', 'name phone');

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Check permissions
    if (invoice.customer._id.toString() !== req.user.id && 
        req.user.role !== 'admin' && 
        req.user.role !== 'technician') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      invoice
    });

  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Update invoice status
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status, paymentMethod, paymentDate } = req.body;
    
    if (req.user.role !== 'admin' && req.user.role !== 'technician') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    invoice.status = status;
    
    if (paymentMethod) {
      invoice.paymentMethod = paymentMethod;
    }
    
    if (paymentDate) {
      invoice.paymentDate = paymentDate;
    }
    
    // If paid, update paid amount
    if (status === 'paid') {
      invoice.paidAmount = invoice.totalAmount;
      invoice.dueAmount = 0;
    }

    await invoice.save();

    res.json({
      success: true,
      message: `Invoice status updated to ${status}`,
      invoice
    });

  } catch (error) {
    console.error('Update invoice status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Record payment
router.post('/:id/payment', auth, async (req, res) => {
  try {
    const { amount, paymentMethod, transactionId } = req.body;
    
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Check if user is customer, admin, or technician
    if (invoice.customer.toString() !== req.user.id && 
        req.user.role !== 'admin' && 
        req.user.role !== 'technician') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const paymentAmount = parseFloat(amount);
    const newPaidAmount = invoice.paidAmount + paymentAmount;
    const newDueAmount = Math.max(0, invoice.totalAmount - newPaidAmount);

    invoice.paidAmount = newPaidAmount;
    invoice.dueAmount = newDueAmount;
    
    if (paymentMethod) {
      invoice.paymentMethod = paymentMethod;
    }
    
    invoice.paymentDate = new Date();

    // Update status based on payment
    if (newDueAmount === 0) {
      invoice.status = 'paid';
    } else if (newPaidAmount > 0) {
      invoice.status = 'partially_paid';
    }

    // TODO: Record payment transaction in separate collection
    // TODO: Process payment through payment gateway

    await invoice.save();

    res.json({
      success: true,
      message: 'Payment recorded successfully',
      invoice: {
        paidAmount: invoice.paidAmount,
        dueAmount: invoice.dueAmount,
        status: invoice.status
      }
    });
