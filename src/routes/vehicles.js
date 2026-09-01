const express = require('express');
const prisma = require('../lib/prisma');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const upload = require('../lib/upload');

const router = express.Router();

router.post('/', requireAuth, requireRole('PROVIDER'), upload.single('registrationDocument'), async (req, res) => {
  try {
    const { make, model, year, color, seatCapacity, photos, amenities } = req.body;

    if (!make || !model || !year || !seatCapacity) {
      return res.status(400).json({ error: 'make, model, year, and seatCapacity are required' });
    }

    let amenitiesArray = amenities;
    if (typeof amenities === 'string') {
      try {
        amenitiesArray = JSON.parse(amenities);
      } catch {
        amenitiesArray = amenities.split(',').map((a) => a.trim()).filter(Boolean);
      }
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        providerId: req.user.userId,
        make,
        model,
        year: Number(year),
        color,
        seatCapacity: Number(seatCapacity),
        photos: photos || [],
        amenities: amenitiesArray || [],
        registrationDocumentUrl: req.file ? '/uploads/' + req.file.filename : undefined,
      },
    });

    res.status(201).json({ vehicle });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Something went wrong creating the vehicle' });
  }
});

router.get('/mine', requireAuth, requireRole('PROVIDER'), async (req, res) => {
  const vehicles = await prisma.vehicle.findMany({
    where: { providerId: req.user.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ vehicles });
});

module.exports = router;
