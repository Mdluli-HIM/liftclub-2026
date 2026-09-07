const express = require('express');
const prisma = require('../lib/prisma');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const upload = require('../lib/upload');

const router = express.Router();

router.post(
  '/',
  requireAuth,
  requireRole('PROVIDER'),
  upload.fields([
    { name: 'registrationDocument', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { make, model, year, color, seatCapacity, amenities, registrationNumber } = req.body;

      if (!make || !model || !year || !seatCapacity) {
        return res.status(400).json({ error: 'make, model, year, and seatCapacity are required' });
      }

      if (!registrationNumber || !registrationNumber.trim()) {
        return res.status(400).json({ error: 'registrationNumber is required so passengers can identify the car' });
      }

      let amenitiesArray = amenities;
      if (typeof amenities === 'string') {
        try {
          amenitiesArray = JSON.parse(amenities);
        } catch {
          amenitiesArray = amenities.split(',').map((a) => a.trim()).filter(Boolean);
        }
      }

      const photoFile = req.files && req.files.photo ? req.files.photo[0] : null;
      const registrationDocFile = req.files && req.files.registrationDocument ? req.files.registrationDocument[0] : null;

      const vehicle = await prisma.vehicle.create({
        data: {
          providerId: req.user.userId,
          make,
          model,
          year: Number(year),
          color,
          seatCapacity: Number(seatCapacity),
          photos: photoFile ? ['/uploads/' + photoFile.filename] : [],
          amenities: amenitiesArray || [],
          registrationNumber: registrationNumber.trim().toUpperCase(),
          registrationDocumentUrl: registrationDocFile ? '/uploads/' + registrationDocFile.filename : undefined,
        },
      });

      res.status(201).json({ vehicle });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Something went wrong creating the vehicle' });
    }
  }
);

router.get('/mine', requireAuth, requireRole('PROVIDER'), async (req, res) => {
  const vehicles = await prisma.vehicle.findMany({
    where: { providerId: req.user.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ vehicles });
});

module.exports = router;
