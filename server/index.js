require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ac-workshop';

mongoose.connect(MONGODB_URI)
.then(() => console.log('MongoDB Connected'))
.catch((err) => console.error('MongoDB Error:', err));

app.get('/', (req, res) => {
  res.json({ 
    message: 'Ahmed Cooling Workshop API',
    status: 'Running'
  });
});

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
