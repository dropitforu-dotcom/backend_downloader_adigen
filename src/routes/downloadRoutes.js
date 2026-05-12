const express = require('express');
const router = express.Router();
const downloadController = require('../controllers/downloadController');

router.post('/info', downloadController.getMetadata);
router.post('/download', downloadController.downloadMedia);
router.post('/audio', downloadController.convertMedia);

module.exports = router;
