export const IPC = {
  newProject: 'project:new',
  openProject: 'project:open',
  updateProject: 'project:update-draft',
  saveProject: 'project:save',
  selectTarget: 'document:select-target',
  selectReferences: 'document:select-references',
  exportPackage: 'package:export',
  validateProject: 'project:validate',
  saveTemplate: 'template:save',
  openTemplate: 'template:open',
  openFolder: 'shell:show-item',
  versions: 'app:versions',
  flushBeforeClose: 'session:flush-before-close',
  closeReady: 'session:close-ready',
  closeCanceled: 'session:close-canceled'
} as const;
