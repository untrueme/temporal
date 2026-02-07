// Центральная точка экспортов workflow-функций для worker bundle.
export { jsonDAGWorkflow } from './jsonDAGWorkflow.js';
export { serviceDeskTicket } from './serviceDeskTicket.js';
export { perDiemPayout, ticketPurchase, hotelBooking } from './childWorkflows.js';
