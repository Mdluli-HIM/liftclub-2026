require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const vehicleRoutes = require('./routes/vehicles');
const tripRoutes = require('./routes/trips');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');
const providerRoutes = require('./routes/providers');

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'https://liftclub-2026-frontend.vercel.app',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/', (req, res) => {
  res.json({ message: 'API is running' });
});

app.use('/auth', authRoutes);
app.use('/vehicles', vehicleRoutes);
app.use('/trips', tripRoutes);
app.use('/bookings', bookingRoutes);
app.use('/admin', adminRoutes);
app.use('/providers', providerRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
