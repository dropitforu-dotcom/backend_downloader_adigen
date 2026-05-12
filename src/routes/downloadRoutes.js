const express = require('express');
const router = express.Router();
const downloadController = require('../controllers/downloadController');

router.post('/metadata', downloadController.getMetadata);
router.post('/download', downloadController.downloadMedia);
router.post('/convert', downloadController.convertMedia);

module.exports = router;
