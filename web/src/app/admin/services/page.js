'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { adminApi } from '../adminApi';
import {
  Wrench,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  X,
  Clock,
  ShieldCheck,
  Flame,
  Star,
  DollarSign,
  Layers,
  Sparkles,
  Check,
  AlertCircle,
  Snowflake,
  WashingMachine,
  Refrigerator,
  Zap,
} from 'lucide-react';

const CATEGORIES = [
  { key: 'all', label: 'All Services', icon: Layers },
  { key: 'ac', label: 'AC Cooling', icon: Snowflake },
  { key: 'refrigerator', label: 'Refrigerators', icon: Refrigerator },
  { key: 'washing-machine', label: 'Washing Machines', icon: WashingMachine },
  { key: 'stove', label: 'Stoves & Ovens', icon: Flame },
  { key: 'electrical', label: 'Electrical', icon: Zap },
  { key: 'general', label: 'General', icon: Wrench },
];

const getServiceIconComponent = (service) => {
  const cat = ((service.category || '') + ' ' + (service.name || '')).toLowerCase();
  if (cat.includes('wash') || cat.includes('laundry')) {
    return <WashingMachine className="w-6 h-6 text-blue-600 dark:text-blue-400 stroke-[1.8]" />;
  }
  if (cat.includes('ref') || cat.includes('fridge') || cat.includes('freezer')) {
    return <Refrigerator className="w-6 h-6 text-cyan-600 dark:text-cyan-400 stroke-[1.8]" />;
  }
  if (cat.includes('stove') || cat.includes('oven')) {
    return <Flame className="w-6 h-6 text-amber-600 dark:text-amber-400 stroke-[1.8]" />;
  }
  if (cat.includes('clean') || cat.includes('jet')) {
    return <Sparkles className="w-6 h-6 text-emerald-600 dark:text-emerald-400 stroke-[1.8]" />;
  }
  if (cat.includes('electr') || cat.includes('wire') || cat.includes('power')) {
    return <Zap className="w-6 h-6 text-amber-500 dark:text-amber-400 stroke-[1.8]" />;
  }
  if (cat.includes('ac') || cat.includes('cool') || cat.includes('freon') || cat.includes('air')) {
    return <Snowflake className="w-6 h-6 text-sky-600 dark:text-sky-400 stroke-[1.8]" />;
  }
  return <Wrench className="w-6 h-6 text-indigo-600 dark:text-indigo-400 stroke-[1.8]" />;
};

export default function AdminServicesPage() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Form State
  const initialForm = {
    _id: '',
    name: '',
    nameAr: '',
    description: '',
    descriptionAr: '',
    category: 'ac',
    icon: '❄️',
    basePrice: 150,
    estimatedDuration: '1-2 hours',
    warrantyDays: 30,
    isPopular: false,
    isEmergency: false,
    active: true,
  };
  const [formData, setFormData] = useState(initialForm);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchServices = useCallback(async () => {
    try {
      const res = await adminApi.getServices();
      const list = res.services || res.data || [];
      setServices(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to load services:', err);
      showToast('Error loading services from server');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchServices();
  };

  // Stats calculation
  const stats = useMemo(() => {
    const total = services.length;
    const popular = services.filter((s) => s.isPopular).length;
    const emergency = services.filter((s) => s.isEmergency).length;
    const avgPrice = total
      ? Math.round(services.reduce((acc, s) => acc + (Number(s.basePrice) || 0), 0) / total)
      : 0;
    return { total, popular, emergency, avgPrice };
  }, [services]);

  // Filtered services
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      const matchesCategory =
        selectedCategory === 'all' || (s.category && s.category.toLowerCase() === selectedCategory);
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        s.name?.toLowerCase().includes(query) ||
        s.nameAr?.toLowerCase().includes(query) ||
        s.description?.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [services, selectedCategory, searchQuery]);

  const openCreateModal = () => {
    setFormData(initialForm);
    setModalMode('create');
    setIsModalOpen(true);
  };

  const openEditModal = (service) => {
    setFormData({
      _id: service._id,
      name: service.name || '',
      nameAr: service.nameAr || '',
      description: service.description || '',
      descriptionAr: service.descriptionAr || '',
      category: service.category || 'ac',
      icon: service.icon || '❄️',
      basePrice: service.basePrice || 150,
      estimatedDuration: service.estimatedDuration || '1-2 hours',
      warrantyDays: service.warrantyDays || 30,
      isPopular: !!service.isPopular,
      isEmergency: !!service.isEmergency,
      active: service.active !== false,
    });
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Please enter service name in English');
      return;
    }
    setSubmitting(true);
    try {
      if (modalMode === 'create') {
        const res = await adminApi.createService(formData);
        showToast('Service added successfully! ✨');
      } else {
        const res = await adminApi.updateService(formData._id, formData);
        showToast('Service updated successfully! 💾');
      }
      setIsModalOpen(false);
      fetchServices();
    } catch (err) {
      console.error('Failed to save service:', err);
      showToast('Error saving service. Please check fields.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await adminApi.deleteService(deleteTarget._id);
      showToast('Service deleted successfully 🗑️');
      setDeleteTarget(null);
      fetchServices();
    } catch (err) {
      console.error('Failed to delete service:', err);
      showToast('Error deleting service');
    }
  };

  const handleToggleActive = async (service) => {
    try {
      await adminApi.updateService(service._id, { active: !service.active });
      showToast(`Service marked as ${!service.active ? 'Active' : 'Inactive'}`);
      fetchServices();
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Services Catalog
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
              {services.length} Total
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage your repair and maintenance offerings, SAR pricing, warranties, and emergency status.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Service</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Services</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{stats.total}</div>
          <div className="text-xs text-slate-500 mt-1">Active repair & maintenance</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Popular Marked</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{stats.popular}</div>
          <div className="text-xs text-slate-500 mt-1">Highlighted on homepage</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">24/7 Emergency</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Flame className="w-4 h-4 text-rose-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{stats.emergency}</div>
          <div className="text-xs text-slate-500 mt-1">Instant urgent dispatch</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Avg. Base Price</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
              SAR
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{stats.avgPrice} <span className="text-sm font-semibold text-slate-400">SAR</span></div>
          <div className="text-xs text-slate-500 mt-1">Standard diagnosis & visit</div>
        </div>
      </div>

      {/* Category Tabs & Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search service by name or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Services Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-500">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm font-medium">Loading services...</p>
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8">
          <Wrench className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No services found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Try adjusting your search keywords or select a different category filter above.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add First Service
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredServices.map((service) => (
            <div
              key={service._id}
              className={`group bg-white dark:bg-slate-900 border rounded-2xl p-5 shadow-sm transition-all hover:shadow-md hover:border-blue-500/50 flex flex-col justify-between ${
                service.active !== false
                  ? 'border-slate-200 dark:border-slate-800'
                  : 'border-slate-200 dark:border-slate-800 opacity-60 bg-slate-50 dark:bg-slate-950'
              }`}
            >
              <div>
                {/* Top Row: Icon, Badges, Status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-500/20 shadow-sm">
                      {getServiceIconComponent(service)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {service.isPopular && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-600 text-white shadow-xs">
                            <Star className="w-2.5 h-2.5 fill-white" />
                            Popular
                          </span>
                        )}
                        {service.isEmergency && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30">
                            <Flame className="w-2.5 h-2.5 text-rose-500" />
                            24/7
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {service.category || 'General'}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1.5 leading-snug group-hover:text-blue-600 transition-colors">
                        {service.name}
                      </h3>
                      {service.nameAr && (
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 font-arabic text-right mt-0.5">
                          {service.nameAr}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Active Toggle Switch */}
                  <button
                    onClick={() => handleToggleActive(service)}
                    className={`px-2 py-1 rounded-full text-[10px] font-bold tracking-wide flex items-center gap-1 transition-all ${
                      service.active !== false
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                    title="Click to toggle active status"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${service.active !== false ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {service.active !== false ? 'Active' : 'Inactive'}
                  </button>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-3 line-clamp-2 leading-relaxed">
                  {service.description || 'Professional home appliance maintenance and genuine replacement parts.'}
                </p>

                {/* Key Attributes */}
                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{service.estimatedDuration || '1-2 hrs'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                    <span>{service.warrantyDays || 30} Days Warranty</span>
                  </div>
                </div>
              </div>

              {/* Bottom Row: Price & Actions */}
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Base Price</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-extrabold text-blue-600 dark:text-blue-400">
                      {service.basePrice || 150}
                    </span>
                    <span className="text-xs font-bold text-slate-500">SAR</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openEditModal(service)}
                    className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                    title="Edit Service"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(service)}
                    className="p-2 rounded-xl text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 transition-all"
                    title="Delete Service"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  {formData.icon || '🔧'}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {modalMode === 'create' ? 'Add New Service' : 'Edit Service'}
                  </h3>
                  <p className="text-xs text-slate-500">Configure pricing, duration, and warranty terms.</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4 mt-5">
              {/* Category & Icon */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  >
                    <option value="ac">Air Conditioning (AC)</option>
                    <option value="refrigerator">Refrigerator & Freezer</option>
                    <option value="washing-machine">Washing Machine</option>
                    <option value="stove">Stove & Cooking Oven</option>
                    <option value="general">General Maintenance</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Icon Style (Outline)
                  </label>
                  <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 h-[42px]">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center shrink-0">
                      {getServiceIconComponent(formData)}
                    </div>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400 capitalize">
                      {formData.category || 'General'} Outline
                    </span>
                  </div>
                </div>
              </div>

              {/* English & Arabic Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Service Name (English) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AC Gas Refill (Freon R410A)"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 text-right font-arabic">
                    اسم الخدمة (عربي)
                  </label>
                  <input
                    type="text"
                    dir="rtl"
                    placeholder="مثال: شحن فريون مكيف سبليت أصلي"
                    value={formData.nameAr}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:outline-none font-arabic"
                  />
                </div>
              </div>

              {/* Pricing, Duration, Warranty */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Base Price (SAR) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="0"
                      value={formData.basePrice}
                      onChange={(e) => setFormData({ ...formData, basePrice: Number(e.target.value) })}
                      className="w-full pl-3.5 pr-12 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:outline-none font-semibold"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      SAR
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Duration Estimate
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1-2 hours"
                    value={formData.estimatedDuration}
                    onChange={(e) => setFormData({ ...formData, estimatedDuration: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Warranty (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.warrantyDays}
                    onChange={(e) => setFormData({ ...formData, warrantyDays: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Descriptions */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Description (English)
                </label>
                <textarea
                  rows={2}
                  placeholder="Details regarding service execution, what is covered..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 text-right font-arabic">
                  الوصف (عربي)
                </label>
                <textarea
                  rows={2}
                  dir="rtl"
                  placeholder="تفاصيل الفحص وقطع الغيار وضمان العمل..."
                  value={formData.descriptionAr}
                  onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:outline-none resize-none font-arabic"
                />
              </div>

              {/* Checkboxes: Popular & Emergency & Active */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isPopular}
                    onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">Popular ⭐</div>
                    <div className="text-[11px] text-slate-500">Feature on homepage</div>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isEmergency}
                    onChange={(e) => setFormData({ ...formData, isEmergency: e.target.checked })}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">24/7 Urgent 🚨</div>
                    <div className="text-[11px] text-slate-500">Emergency dispatch</div>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">Active Status</div>
                    <div className="text-[11px] text-slate-500">Visible to customers</div>
                  </div>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : modalMode === 'create' ? 'Create Service' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-center text-slate-900 dark:text-white">
              Delete Service?
            </h3>
            <p className="text-xs text-center text-slate-500 mt-2">
              Are you sure you want to remove <span className="font-semibold text-slate-800 dark:text-slate-200">"{deleteTarget.name}"</span>? Existing historical bookings will not be deleted.
            </p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Keep Service
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-md shadow-rose-500/20"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
