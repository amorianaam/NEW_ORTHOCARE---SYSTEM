const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { uploadRadiology, uploadLab, uploadGeneralStore, uploadOrStore } = require('../middleware/upload');
const patientCtrl = require('../controllers/patientController');
const doctorCtrl  = require('../controllers/doctorController');
const cashierCtrl = require('../controllers/cashierController');
const labCtrl     = require('../controllers/labController');
const labInventoryCtrl = require('../controllers/labInventoryController');
const radCtrl     = require('../controllers/radiologyController');
const radInventoryCtrl = require('../controllers/radiologyInventoryController');
const surgCtrl    = require('../controllers/surgeryController');
const genStoreCtrl = require('../controllers/generalStoreController');
const orStoreCtrl  = require('../controllers/orStoreController');
const reportsCtrl  = require('../controllers/reportsController');
const adminCatalogCtrl = require('../controllers/adminCatalogController');
const favoritesCtrl = require('../controllers/favoritesController');
const alertsCtrl = require('../controllers/inventoryAlertsController');

// ── Patient Routes ────────────────────────────────────────────────
router.get('/patients',               auth, patientCtrl.getAllPatients);
router.post('/patients',              auth, patientCtrl.createPatient);
router.post('/patients/follow-up',    auth, patientCtrl.createFollowUp);
router.get('/patients/visits/today',  auth, patientCtrl.getTodayVisits);
router.post('/patients/:id/visits',   auth, patientCtrl.createExistingPatientVisit);
router.get('/patients/:id/follow-up-eligibility', auth, patientCtrl.getFollowUpEligibility);
router.get('/patients/:id',           auth, patientCtrl.getPatientById);
router.put('/patients/:id',           auth, patientCtrl.updatePatient);

// ── Doctor Clinical Routes ────────────────────────────────────────
router.get('/doctor/dashboard-stats',             auth, doctorCtrl.getDashboardStats);
router.get('/doctor/queue',                       auth, doctorCtrl.getQueue);
router.put('/doctor/visit/:visitId/start',        auth, doctorCtrl.startExamination);
router.post('/doctor/visit/:visitId/order-services', auth, doctorCtrl.orderServices);
router.put('/doctor/visit/:visitId/close',        auth, doctorCtrl.closeVisit);
router.put('/doctor/visit/:visitId/refer-surgery',auth, doctorCtrl.referToSurgery);
router.get('/doctor/patient/:patientId/history',  auth, doctorCtrl.getPatientHistory);
router.delete('/doctor/order-service/:type/:id',  auth, doctorCtrl.cancelServiceRequest);
router.put('/doctor/clinical-service/:id/complete', auth, doctorCtrl.completeClinicalService);
router.post('/doctor/visit/:visitId/prescription', auth, doctorCtrl.savePrescription);
router.get('/doctor/visit/:visitId/prescription',  auth, doctorCtrl.getPrescription);
router.post('/doctor/vip-intake',                   auth, doctorCtrl.createVipIntake);


// ── Doctor Favorites Routes ───────────────────────────────────────
router.get('/doctor/favorites/medications',                    auth, favoritesCtrl.getFavoriteMeds);
router.post('/doctor/favorites/medications',                   auth, favoritesCtrl.addFavoriteMed);
router.delete('/doctor/favorites/medications/:id',             auth, favoritesCtrl.deleteFavoriteMed);
router.get('/doctor/favorites/medications/preferred-dosages',  auth, favoritesCtrl.getPreferredDosages);
router.post('/doctor/favorites/medications/preferred-dosages', auth, favoritesCtrl.addPreferredDosage);

router.get('/doctor/favorites/tests',                          auth, favoritesCtrl.getFavoriteTests);
router.post('/doctor/favorites/tests',                         auth, favoritesCtrl.addFavoriteTest);
router.delete('/doctor/favorites/tests/:id',                   auth, favoritesCtrl.deleteFavoriteTest);
router.delete('/doctor/favorites/tests/type/:testType/id/:testId', auth, favoritesCtrl.deleteFavoriteTestByTypeAndId);

router.get('/doctor/favorites/bundles',                        auth, favoritesCtrl.getFavoriteBundles);
router.post('/doctor/favorites/bundles',                       auth, favoritesCtrl.createFavoriteBundle);
router.delete('/doctor/favorites/bundles/:id',                 auth, favoritesCtrl.deleteFavoriteBundle);

// ── Doctor Admin Routes ───────────────────────────────────────────
router.get('/admin/users',           auth, doctorCtrl.getUsers);
router.post('/admin/users',          auth, doctorCtrl.createUser);
router.put('/admin/users/:id/toggle',auth, doctorCtrl.toggleUserStatus);
router.put('/admin/users/:id/reset-password', auth, doctorCtrl.resetPassword);

// ── Catalog Routes ────────────────────────────────────────────────
router.get('/catalog/lab',       auth, doctorCtrl.getLabTests);
router.get('/catalog/radiology', auth, doctorCtrl.getRadiologyTests);

// ── Admin Catalog Routes ──────────────────────────────────────────
router.get('/admin/catalog/medications',       auth, adminCatalogCtrl.getMedications);
router.post('/admin/catalog/medications',      auth, adminCatalogCtrl.createMedication);
router.put('/admin/catalog/medications/:id',   auth, adminCatalogCtrl.updateMedication);
router.delete('/admin/catalog/medications/:id',auth, adminCatalogCtrl.deleteMedication);

router.get('/admin/catalog/clinical-categories',     auth, adminCatalogCtrl.getClinicalCategories);
router.post('/admin/catalog/clinical-categories',    auth, adminCatalogCtrl.createClinicalCategory);
router.put('/admin/catalog/clinical-categories/:id', auth, adminCatalogCtrl.updateClinicalCategory);
router.delete('/admin/catalog/clinical-categories/:id', auth, adminCatalogCtrl.deleteClinicalCategory);

router.get('/admin/catalog/clinical-services',       auth, adminCatalogCtrl.getClinicalServices);
router.post('/admin/catalog/clinical-services',      auth, adminCatalogCtrl.createClinicalService);
router.put('/admin/catalog/clinical-services/:id',   auth, adminCatalogCtrl.updateClinicalService);
router.delete('/admin/catalog/clinical-services/:id', auth, adminCatalogCtrl.deleteClinicalService);

router.get('/admin/catalog/surgery-prep',          auth, adminCatalogCtrl.getSurgeryPrepPackages);
router.post('/admin/catalog/surgery-prep',         auth, adminCatalogCtrl.createSurgeryPrepPackage);
router.put('/admin/catalog/surgery-prep/:id',      auth, adminCatalogCtrl.updateSurgeryPrepPackage);
router.delete('/admin/catalog/surgery-prep/:id',   auth, adminCatalogCtrl.deleteSurgeryPrepPackage);
router.post('/admin/catalog/surgery-prep-items',   auth, adminCatalogCtrl.addSurgeryPrepItem);
router.delete('/admin/catalog/surgery-prep-items/:id', auth, adminCatalogCtrl.removeSurgeryPrepItem);

// Lab categories & tests (admin CRUD)
router.get('/admin/catalog/lab-categories',          auth, adminCatalogCtrl.getLabCategories);
router.post('/admin/catalog/lab-categories',         auth, adminCatalogCtrl.createLabCategory);
router.put('/admin/catalog/lab-categories/:id',      auth, adminCatalogCtrl.updateLabCategory);
router.delete('/admin/catalog/lab-categories/:id',   auth, adminCatalogCtrl.deleteLabCategory);

router.get('/admin/catalog/lab-tests',               auth, adminCatalogCtrl.getLabTestsAdmin);
router.post('/admin/catalog/lab-tests',              auth, adminCatalogCtrl.createLabTest);
router.put('/admin/catalog/lab-tests/:id',           auth, adminCatalogCtrl.updateLabTest);
router.delete('/admin/catalog/lab-tests/:id',        auth, adminCatalogCtrl.deleteLabTest);

// Radiology categories & tests (admin CRUD)
router.get('/admin/catalog/radiology-categories',          auth, adminCatalogCtrl.getRadiologyCategories);
router.post('/admin/catalog/radiology-categories',         auth, adminCatalogCtrl.createRadiologyCategory);
router.put('/admin/catalog/radiology-categories/:id',      auth, adminCatalogCtrl.updateRadiologyCategory);
router.delete('/admin/catalog/radiology-categories/:id',   auth, adminCatalogCtrl.deleteRadiologyCategory);

router.get('/admin/catalog/radiology-tests',               auth, adminCatalogCtrl.getRadiologyTestsAdmin);
router.post('/admin/catalog/radiology-tests',              auth, adminCatalogCtrl.createRadiologyTest);
router.put('/admin/catalog/radiology-tests/:id',           auth, adminCatalogCtrl.updateRadiologyTest);
router.delete('/admin/catalog/radiology-tests/:id',        auth, adminCatalogCtrl.deleteRadiologyTest);

// ── User Self-Service Routes ──────────────────────────────────────
const userCtrl = require('../controllers/userController');
router.put('/users/profile',         auth, userCtrl.updateProfile);
router.put('/users/change-password', auth, userCtrl.changePassword);

// ── Admin Password Approval Routes ────────────────────────────────
router.get('/admin/password-change-requests',            auth, userCtrl.getPasswordRequests);
router.put('/admin/password-change-requests/:id/approve', auth, userCtrl.approvePasswordRequest);
router.put('/admin/password-change-requests/:id/reject',  auth, userCtrl.rejectPasswordRequest);

// ── Cashier Routes ────────────────────────────────────────────────
router.get('/cashier/archive/patients',               auth, cashierCtrl.getArchivePatients);
router.get('/cashier/archive/patient/:id',            auth, cashierCtrl.getPatientFinancialRecord);
router.get('/cashier/board/today',                    auth, cashierCtrl.getDailyBoard);
router.get('/cashier/pending',                        auth, cashierCtrl.getPending);
router.post('/cashier/visit/:id/pay-entry',           auth, cashierCtrl.payEntryFee);
router.put('/cashier/visit/:id/cancel',               auth, cashierCtrl.cancelVisit);
router.put('/cashier/visit/:id/postpone',             auth, cashierCtrl.postponeServices);
router.put('/cashier/visit/:id/suspend-services',     auth, cashierCtrl.suspendServices);
router.put('/cashier/service/:type/:id/reactivate-and-pay', auth, cashierCtrl.reactivateAndPayService);
router.put('/cashier/service/:type/:id/cancel', auth, cashierCtrl.cancelSingleService);
router.delete('/cashier/service/:type/:id', auth, cashierCtrl.deleteSuspendedService);
router.put('/cashier/visit/:id/refund-all',           auth, cashierCtrl.refundVisit);
router.post('/cashier/patient/:id/general-refund',    auth, cashierCtrl.generalRefund);
router.get('/cashier/waiting',                        auth, cashierCtrl.getWaiting);
router.get('/cashier/visit/:id/invoice',              auth, cashierCtrl.getInvoice);
router.post('/cashier/visit/:id/pay-services',        auth, cashierCtrl.payServices);
router.put('/cashier/service-lab/:id/refund',         auth, cashierCtrl.refundLabService);
router.put('/cashier/service-radiology/:id/refund',   auth, cashierCtrl.refundRadiologyService);
router.put('/cashier/service-clinical/:id/refund',    auth, cashierCtrl.refundClinicalService);
router.get('/cashier/surgeries',                      auth, cashierCtrl.getSurgeries);
router.get('/cashier/surgery/:id/payments',           auth, cashierCtrl.getSurgeryPayments);
router.get('/cashier/surgery/:id/or-supplies',         auth, cashierCtrl.getSurgerySuppliesCost);
router.post('/cashier/surgery/:id/pay',               auth, cashierCtrl.paySurgery);
router.get('/cashier/general-transactions',           auth, cashierCtrl.getGeneralTransactions);
router.post('/cashier/general-transactions',          auth, cashierCtrl.addGeneralTransaction);
router.get('/cashier/refundable-patients',            auth, cashierCtrl.getRefundablePatients);
router.get('/cashier/visit-refundable-services/:visitId', auth, cashierCtrl.getVisitRefundableServices);
router.get('/cashier/stats/summary',                  auth, cashierCtrl.getStatsSummary);
router.get('/cashier/stats/transactions',             auth, cashierCtrl.getTransactions);

// ── Settings Routes ───────────────────────────────────────────────
router.get('/settings',        auth, doctorCtrl.getSettings);
router.put('/settings',        auth, doctorCtrl.updateSetting);

// ── Audit Log ─────────────────────────────────────────────────────
router.get('/audit-log',       auth, doctorCtrl.getAuditLog);

// ── Lab Routes ────────────────────────────────────────────────────
router.get('/lab/requests',                        auth, labCtrl.getRequests);
router.get('/lab/visit/:visitId',                  auth, labCtrl.getVisitDetails);
router.put('/lab/request/:requestId/status',       auth, labCtrl.updateRequestStatus);
router.put('/lab/visit/:visitId/start-all',        auth, labCtrl.startAllRequests);
router.post('/lab/request/:requestId/result',      auth, uploadLab.array('files', 10), labCtrl.uploadResult);
router.post('/lab/visit/:visitId/bulk-result',       auth, uploadLab.array('files', 10), labCtrl.bulkUploadResult);
router.put('/lab/visit/:visitId/complete',         auth, labCtrl.completeVisitLab);
router.get('/lab/stats',                           auth, labCtrl.getStats);

// ── Lab Inventory & BOM Routes ────────────────────────────────────
router.get('/lab/inventory/items',                                  auth, labInventoryCtrl.getInventoryItems);
router.post('/lab/inventory/items',                                 auth, labInventoryCtrl.createInventoryItem);
router.put('/lab/inventory/items/:id',                              auth, labInventoryCtrl.updateInventoryItem);
router.post('/lab/inventory/items/:id/adjust',                      auth, labInventoryCtrl.adjustInventoryStock);
router.delete('/lab/inventory/items/:id',                           auth, labInventoryCtrl.deleteInventoryItem);
router.get('/lab/inventory/test-consumables',                       auth, labInventoryCtrl.getTestConsumables);
router.get('/lab/inventory/test-consumables/:testId',               auth, labInventoryCtrl.getTestConsumables);
router.post('/lab/inventory/test-consumables',                      auth, labInventoryCtrl.saveTestConsumables);
router.post('/lab/inventory/test-consumables/:testId',              auth, labInventoryCtrl.saveTestConsumables);
router.put('/lab/inventory/test-consumables/:testId',               auth, labInventoryCtrl.saveTestConsumables);
router.get('/lab/inventory/transfers/pending',                      auth, labInventoryCtrl.getPendingTransfers);
router.get('/lab/inventory/transfers/history',                      auth, labInventoryCtrl.getTransfersHistory);
router.post('/lab/inventory/transfers/batch/:batch_ref/receive',    auth, labInventoryCtrl.receiveBatch);
router.post('/lab/inventory/transfers/batch/:batch_ref/reject',     auth, labInventoryCtrl.rejectBatch);
router.post('/lab/inventory/spoilage',                              auth, labInventoryCtrl.recordSpoilage);
router.post('/lab/inventory/wastage',                               auth, labInventoryCtrl.recordSpoilage);
router.get('/lab/inventory/consumption-log',                        auth, labInventoryCtrl.getConsumptionLog);
router.get('/lab/inventory/financial-analytics',                    auth, labInventoryCtrl.getLabFinancialAnalytics);

// ── Radiology Routes ──────────────────────────────────────────────
router.get('/radiology/requests',                  auth, radCtrl.getRequests);
router.get('/radiology/visit/:visitId',            auth, radCtrl.getVisitDetails);
router.put('/radiology/request/:requestId/status', auth, radCtrl.updateRequestStatus);
router.put('/radiology/visit/:visitId/start-all',  auth, radCtrl.startAllRequests);
router.post('/radiology/visit/:visitId/films',     auth, radCtrl.createFilmGroup);
router.delete('/radiology/films/:filmId',          auth, radCtrl.deleteFilmGroup);
router.post('/radiology/films/:filmId/result',     auth, uploadRadiology.array('files', 10), radCtrl.uploadFilmResult);
router.post('/radiology/request/:requestId/result',auth, uploadRadiology.array('files', 10), radCtrl.uploadResult);
router.put('/radiology/visit/:visitId/complete',   auth, radCtrl.completeVisitRadiology);
router.get('/radiology/stats',                     auth, radCtrl.getStats);

// ── Radiology Inventory Routes ──────────────────────────────────
router.get('/radiology/inventory/items',                            auth, radInventoryCtrl.getInventoryItems);
router.post('/radiology/inventory/items',                           auth, radInventoryCtrl.createInventoryItem);
router.put('/radiology/inventory/items/:id',                        auth, radInventoryCtrl.updateInventoryItem);
router.post('/radiology/inventory/items/:id/adjust',                auth, radInventoryCtrl.adjustInventoryStock);
router.delete('/radiology/inventory/items/:id',                     auth, radInventoryCtrl.deleteInventoryItem);
router.get('/radiology/inventory/transfers/pending',                auth, radInventoryCtrl.getPendingTransfers);
router.get('/radiology/inventory/transfers/history',                auth, radInventoryCtrl.getTransfersHistory);
router.post('/radiology/inventory/transfers/batch/:batch_ref/receive', auth, radInventoryCtrl.receiveBatch);
router.post('/radiology/inventory/transfers/batch/:batch_ref/reject',  auth, radInventoryCtrl.rejectBatch);
router.post('/radiology/inventory/wastage',                         auth, radInventoryCtrl.recordWastage);
router.get('/radiology/inventory/consumption-log',                  auth, radInventoryCtrl.getConsumptionLog);
router.get('/radiology/inventory/financial-analytics',              auth, radInventoryCtrl.getRadiologyFinancialAnalytics);
router.get('/radiology/inventory/analytics',                        auth, radInventoryCtrl.getRadiologyFinancialAnalytics);

// ── Surgery Routes ────────────────────────────────────────────────
router.get('/surgery/dashboard',                   auth, surgCtrl.getSurgeriesDashboard);
router.get('/surgery/:id',                         auth, surgCtrl.getSurgeryDetails);
router.put('/surgery/:id/price',                   auth, surgCtrl.priceSurgery);
router.put('/surgery/:id/status',                  auth, surgCtrl.updateSurgeryStatus);
router.post('/surgery/:id/diagnostic',             auth, surgCtrl.addDiagnosticService);
router.get('/surgery/inventory/items',             auth, surgCtrl.getInventoryItems);
router.post('/surgery/:id/material',               auth, surgCtrl.addMaterial);
router.delete('/surgery/:id/material/:materialId',   auth, surgCtrl.deleteMaterial);
router.post('/surgery/:id/expense',                auth, surgCtrl.addExpense);
router.delete('/surgery/:id/expense/:expenseId',     auth, surgCtrl.deleteExpense);
router.put('/surgery/:id/complete',                auth, surgCtrl.completeSurgery);

// ── Inventory Alerts Routes ───────────────────────────────────────
router.get('/inventory/general/alerts',            auth, alertsCtrl.getGeneralAlerts);
router.get('/inventory/or/alerts',                 auth, alertsCtrl.getOrAlerts);
router.get('/inventory/lab/alerts',                auth, alertsCtrl.getLabAlerts);
router.get('/inventory/radiology/alerts',          auth, alertsCtrl.getRadiologyAlerts);
router.get('/lab/inventory/alerts',                auth, alertsCtrl.getLabAlerts);
router.get('/radiology/inventory/alerts',          auth, alertsCtrl.getRadiologyAlerts);

// ── General Store Routes ──────────────────────────────────────────
router.get('/inventory/general/dashboard',         auth, genStoreCtrl.getDashboardStats);
router.get('/inventory/general/dashboard/transactions', auth, genStoreCtrl.getDashboardTransactions);

// Outbound Transfers (General Store)
router.get('/inventory/general/transfers/pending-outbound', auth, genStoreCtrl.getPendingOutboundTransfers);
router.post('/inventory/general/transfers/batch/:batch_ref/revoke', auth, genStoreCtrl.revokeBatch);

router.get('/inventory/general/transfers/pending-incoming', auth, genStoreCtrl.getPendingIncomingFromOR);
router.post('/inventory/general/transfers/batch/:batch_ref/accept', auth, genStoreCtrl.acceptBatchFromOR);
router.post('/inventory/general/transfers/batch/:batch_ref/reject', auth, genStoreCtrl.rejectBatchFromOR);


router.get('/inventory/general/items',             auth, genStoreCtrl.getItems);
router.get('/inventory/general/items/:id',         auth, genStoreCtrl.getItemById);
router.post('/inventory/general/items',            auth, genStoreCtrl.createItem);
router.put('/inventory/general/items/:id',         auth, genStoreCtrl.updateItem);
router.delete('/inventory/general/items/:id',      auth, genStoreCtrl.deleteItem);
router.get('/inventory/general/items/:id/movements',auth, genStoreCtrl.getItemMovements);
router.get('/inventory/general/items/:id/audit',   auth, genStoreCtrl.getItemAuditLogs);
router.post('/inventory/general/receive',          auth, uploadGeneralStore.single('invoice'), genStoreCtrl.receiveStock);
router.post('/inventory/general/issue',            auth, uploadGeneralStore.single('document'), genStoreCtrl.issueStock);
router.get('/inventory/general/stocktaking',                       auth, genStoreCtrl.getStocktakingSessions);
router.post('/inventory/general/stocktaking',                      auth, genStoreCtrl.createStocktaking);
router.put('/inventory/general/stocktaking/:id',                   auth, genStoreCtrl.updateStocktakingDraft);
router.delete('/inventory/general/stocktaking/:id',                auth, genStoreCtrl.deleteStocktakingDraft);
router.get('/inventory/general/stocktaking/:id',                   auth, genStoreCtrl.getStocktakingSessionById);
router.get('/inventory/general/stocktaking/:id/staleness-check',   auth, genStoreCtrl.checkDraftStaleness);
router.patch('/inventory/general/stocktaking/:id/refresh-expected',auth, genStoreCtrl.refreshDraftExpected);
router.patch('/inventory/general/stocktaking/:id/finalize',        auth, genStoreCtrl.finalizeStocktaking);
router.get('/inventory/general/batch/:batchId',                    auth, genStoreCtrl.getBatchDetails);
router.get('/inventory/general/transaction/:id',   auth, genStoreCtrl.getTransactionDetails);

// ── OR Store Routes ───────────────────────────────────────────────
router.get('/inventory/or/dashboard',              auth, orStoreCtrl.getDashboardStats);
router.get('/inventory/or/dashboard/transactions', auth, orStoreCtrl.getDashboardTransactions);
router.get('/inventory/or/items/:id/movements',    auth, orStoreCtrl.getItemMovements);
router.get('/inventory/or/items/:id/audit-logs',   auth, orStoreCtrl.getItemAuditLogs);
router.get('/inventory/or/batch/:batchId',      auth, orStoreCtrl.getBatchDetails);
router.get('/inventory/or/transaction/:id',     auth, orStoreCtrl.getTransactionDetails);

router.get('/inventory/or/items',                  auth, orStoreCtrl.getItems);
router.get('/inventory/or/items/:id',              auth, orStoreCtrl.getItemById);
router.post('/inventory/or/items',                 auth, orStoreCtrl.createItem);
router.put('/inventory/or/items/:id',              auth, orStoreCtrl.updateItem);
router.delete('/inventory/or/items/:id',           auth, orStoreCtrl.deleteItem);
router.post('/inventory/or/issue',                 auth, uploadOrStore.single('document'), orStoreCtrl.issueStock);
router.get('/inventory/or/transfers/pending',      auth, orStoreCtrl.getPendingTransfers);
router.post('/inventory/or/transfers/batch/:batch_ref/receive', auth, orStoreCtrl.receiveBatch);
router.post('/inventory/or/transfers/batch/:batch_ref/reject',  auth, orStoreCtrl.rejectBatch);

router.get('/inventory/or/transfers/pending-outbound', auth, orStoreCtrl.getPendingOutboundFromOR);
router.post('/inventory/or/transfers/batch/:batch_ref/revoke', auth, orStoreCtrl.revokeBatchOR);

router.post('/inventory/or/receive-direct',        auth, uploadOrStore.single('invoice'), orStoreCtrl.receiveDirectStock);
router.get('/inventory/or/manufacturing',         auth, orStoreCtrl.getManufacturingOrders);
router.post('/inventory/or/manufacturing',         auth, orStoreCtrl.createManufacturing);
router.post('/inventory/or/manufacturing/:id/reverse', auth, orStoreCtrl.reverseManufacturingOrder);
router.get('/inventory/or/stocktaking',            auth, orStoreCtrl.getStocktakingSessions);
router.post('/inventory/or/stocktaking',           auth, orStoreCtrl.createStocktaking);
router.put('/inventory/or/stocktaking/:id',                   auth, orStoreCtrl.updateStocktakingDraft);
router.delete('/inventory/or/stocktaking/:id',                auth, orStoreCtrl.deleteStocktakingDraft);
router.get('/inventory/or/stocktaking/:id',                   auth, orStoreCtrl.getStocktakingSessionById);
router.get('/inventory/or/stocktaking/:id/staleness-check',   auth, orStoreCtrl.checkDraftStaleness);
router.patch('/inventory/or/stocktaking/:id/refresh-expected',auth, orStoreCtrl.refreshDraftExpected);
router.patch('/inventory/or/stocktaking/:id/finalize',        auth, orStoreCtrl.finalizeStocktaking);

// ── Reports & Analytics Routes ─────────────────────────────────────────
router.get('/reports/dashboard',            auth, reportsCtrl.getExecutiveDashboard);
router.get('/reports/financial',            auth, reportsCtrl.getFinancialReport);
router.get('/reports/surgery-performance',  auth, reportsCtrl.getSurgeryPerformance);
router.get('/reports/patients-visits',      auth, reportsCtrl.getPatientsVisits);
router.get('/reports/patients-visits/:id',  auth, reportsCtrl.getPatientVisitDetail);
router.get('/reports/diagnostics',          auth, reportsCtrl.getDiagnosticsReport);
router.get('/reports/cashier-ops',          auth, reportsCtrl.getCashierOperations);
router.get('/reports/inventory',            auth, reportsCtrl.getInventoryReport);
router.get('/reports/inventory/item/:id',   auth, reportsCtrl.getItemHistory);
router.get('/reports/surgery-details/:id',  auth, reportsCtrl.getSurgeryDetails);
router.get('/doctor/reports/analytical',    auth, reportsCtrl.getDoctorAnalyticalReports);



// ── Global Search ─────────────────────────────────────────────────
router.get('/search', auth, patientCtrl.search);

module.exports = router;

