import { contextBridge, ipcRenderer } from 'electron';
import type {
  EduIgniteApi,
  UpdateAvailablePayload,
  UpdateDownloadedPayload,
  UpdateErrorPayload,
  UpdateProgressPayload,
} from '../src/shared/api';

// Typed contextBridge surface exposed to the renderer as `window.api`. Every
// method is a thin `ipcRenderer.invoke` call into a handler registered by
// src/ipc/handlers.ts — contextIsolation stays on, so the renderer never gets
// direct access to ipcRenderer, Node, or Electron APIs, only this bridge.

const api: EduIgniteApi = {
  school: {
    get: () => ipcRenderer.invoke('school:get'),
    upsert: (input) => ipcRenderer.invoke('school:upsert', input),
  },
  teachers: {
    list: (schoolId) => ipcRenderer.invoke('teachers:list', schoolId),
    create: (input) => ipcRenderer.invoke('teachers:create', input),
    update: (id, input) => ipcRenderer.invoke('teachers:update', id, input),
    setActive: (id, isActive) => ipcRenderer.invoke('teachers:setActive', id, isActive),
  },
  classes: {
    list: (schoolId) => ipcRenderer.invoke('classes:list', schoolId),
    create: (input) => ipcRenderer.invoke('classes:create', input),
    listStreams: (classId) => ipcRenderer.invoke('classes:listStreams', classId),
    createStream: (input) => ipcRenderer.invoke('classes:createStream', input),
    updateStream: (id, input) => ipcRenderer.invoke('classes:updateStream', id, input),
    countEnrollment: (classStreamId) => ipcRenderer.invoke('classes:countEnrollment', classStreamId),
  },
  subjects: {
    list: (schoolId) => ipcRenderer.invoke('subjects:list', schoolId),
    create: (input) => ipcRenderer.invoke('subjects:create', input),
    listForStream: (classStreamId, academicYear) =>
      ipcRenderer.invoke('subjects:listForStream', classStreamId, academicYear),
    assign: (input) => ipcRenderer.invoke('subjects:assign', input),
    updateAssignment: (id, input) => ipcRenderer.invoke('subjects:updateAssignment', id, input),
  },
  students: {
    list: (filters) => ipcRenderer.invoke('students:list', filters),
    get: (id) => ipcRenderer.invoke('students:get', id),
    create: (input) => ipcRenderer.invoke('students:create', input),
    update: (id, input) => ipcRenderer.invoke('students:update', id, input),
    listPromotions: (studentId) => ipcRenderer.invoke('students:listPromotions', studentId),
    promoteClass: (input) => ipcRenderer.invoke('students:promoteClass', input),
  },
  attendance: {
    recordDay: (input) => ipcRenderer.invoke('attendance:recordDay', input),
    history: (filters) => ipcRenderer.invoke('attendance:history', filters),
    rateReport: (classStreamId, term, academicYear) =>
      ipcRenderer.invoke('attendance:rateReport', classStreamId, term, academicYear),
  },
  academics: {
    recordCat: (input) => ipcRenderer.invoke('academics:recordCat', input),
    recordExam: (input) => ipcRenderer.invoke('academics:recordExam', input),
    listForStudentTerm: (studentId, term, academicYear) =>
      ipcRenderer.invoke('academics:listForStudentTerm', studentId, term, academicYear),
  },
  reportCards: {
    compile: (input) => ipcRenderer.invoke('reportCards:compile', input),
    compileForStream: (classStreamId, term, academicYear, promotionAverage) =>
      ipcRenderer.invoke('reportCards:compileForStream', classStreamId, term, academicYear, promotionAverage),
    list: (filters) => ipcRenderer.invoke('reportCards:list', filters),
    get: (id) => ipcRenderer.invoke('reportCards:get', id),
    exportPdf: (id) => ipcRenderer.invoke('reportCards:exportPdf', id),
  },
  finance: {
    listFeeTemplates: (schoolId, filters) => ipcRenderer.invoke('finance:listFeeTemplates', schoolId, filters),
    createFeeTemplate: (input) => ipcRenderer.invoke('finance:createFeeTemplate', input),
    recordPayment: (input) => ipcRenderer.invoke('finance:recordPayment', input),
    listPaymentsForStudent: (studentId) => ipcRenderer.invoke('finance:listPaymentsForStudent', studentId),
    getBalance: (input) => ipcRenderer.invoke('finance:getBalance', input),
    listTransactions: (filters) => ipcRenderer.invoke('finance:listTransactions', filters),
    collectionsReport: (schoolId, term, academicYear) =>
      ipcRenderer.invoke('finance:collectionsReport', schoolId, term, academicYear),
    exportReceiptPdf: (paymentId) => ipcRenderer.invoke('finance:exportReceiptPdf', paymentId),
  },
  license: {
    check: () => ipcRenderer.invoke('license:check'),
  },
  licensing: {
    getStatus: () => ipcRenderer.invoke('licensing:getStatus'),
    getDeviceInfo: () => ipcRenderer.invoke('licensing:getDeviceInfo'),
    generateChallenge: (purpose, previousDeviceId) =>
      ipcRenderer.invoke('licensing:generateChallenge', purpose, previousDeviceId),
    installCertificateResponse: (responseJson) =>
      ipcRenderer.invoke('licensing:installCertificateResponse', responseJson),
  },
  sync: {
    run: () => ipcRenderer.invoke('sync:run'),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },
  update: {
    download: () => ipcRenderer.invoke('update:download'),
    quitAndInstall: () => ipcRenderer.invoke('update:quitAndInstall'),
    // Subscription methods: no other channel in this file is main->renderer
    // pushed (every other `api.*` method is a one-shot invoke/response), so
    // there's no existing convention to mirror for this half. Modeled
    // instead on the standard Electron contextBridge pattern for pushed
    // events -- wrap `ipcRenderer.on`, strip the IpcRendererEvent argument
    // (the renderer only ever cares about the payload), and return an
    // `off()` so a React useEffect can unsubscribe on cleanup/re-render
    // instead of accumulating duplicate listeners.
    onAvailable: (callback) => {
      const listener = (_event: unknown, payload: UpdateAvailablePayload) => callback(payload);
      ipcRenderer.on('update:available', listener);
      return () => ipcRenderer.removeListener('update:available', listener);
    },
    onProgress: (callback) => {
      const listener = (_event: unknown, payload: UpdateProgressPayload) => callback(payload);
      ipcRenderer.on('update:progress', listener);
      return () => ipcRenderer.removeListener('update:progress', listener);
    },
    onDownloaded: (callback) => {
      const listener = (_event: unknown, payload: UpdateDownloadedPayload) => callback(payload);
      ipcRenderer.on('update:downloaded', listener);
      return () => ipcRenderer.removeListener('update:downloaded', listener);
    },
    onError: (callback) => {
      const listener = (_event: unknown, payload: UpdateErrorPayload) => callback(payload);
      ipcRenderer.on('update:error', listener);
      return () => ipcRenderer.removeListener('update:error', listener);
    },
  },
  auth: {
    login: (emailOrUsername, password) => ipcRenderer.invoke('auth:login', emailOrUsername, password),
    logout: () => ipcRenderer.invoke('auth:logout'),
    currentSession: () => ipcRenderer.invoke('auth:currentSession'),
    getRecoveryQuestion: (emailOrUsername) => ipcRenderer.invoke('auth:getRecoveryQuestion', emailOrUsername),
    resetPassword: (emailOrUsername, securityAnswer, newPassword) =>
      ipcRenderer.invoke('auth:resetPassword', emailOrUsername, securityAnswer, newPassword),
  },
  users: {
    list: (schoolId) => ipcRenderer.invoke('users:list', schoolId),
    create: (input) => ipcRenderer.invoke('users:create', input),
    setStatus: (id, status) => ipcRenderer.invoke('users:setStatus', id, status),
  },
  sampleData: {
    hasSample: () => ipcRenderer.invoke('sampleData:has'),
    seed: () => ipcRenderer.invoke('sampleData:seed'),
    clear: () => ipcRenderer.invoke('sampleData:clear'),
  },
  setup: {
    ping: () => ipcRenderer.invoke('setup:ping'),
    searchSchools: (query) => ipcRenderer.invoke('setup:searchSchools', query),
    confirmSchool: (input) => ipcRenderer.invoke('setup:confirmSchool', input),
    createFirstAdmin: (input) => ipcRenderer.invoke('setup:createFirstAdmin', input),
    completeSetup: () => ipcRenderer.invoke('setup:completeSetup'),
  },
  structure: {
    list: (schoolId) => ipcRenderer.invoke('structure:list', schoolId),
    tree: (schoolId) => ipcRenderer.invoke('structure:tree', schoolId),
    create: (input) => ipcRenderer.invoke('structure:create', input),
    update: (id, input) => ipcRenderer.invoke('structure:update', id, input),
    move: (id, newParentId) => ipcRenderer.invoke('structure:move', id, newParentId),
    delete: (id) => ipcRenderer.invoke('structure:delete', id),
  },
  notices: {
    listPublished: (schoolId) => ipcRenderer.invoke('notices:listPublished', schoolId),
    listAll: (schoolId) => ipcRenderer.invoke('notices:listAll', schoolId),
    create: (input) => ipcRenderer.invoke('notices:create', input),
    setPublished: (id, isPublished) => ipcRenderer.invoke('notices:setPublished', id, isPublished),
  },
  backup: {
    create: (passphrase) => ipcRenderer.invoke('backup:create', passphrase),
    restore: (passphrase) => ipcRenderer.invoke('backup:restore', passphrase),
  },
};

contextBridge.exposeInMainWorld('api', api);
