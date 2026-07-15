const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const IPC = {
  newProject: 'project:new',
  openProject: 'project:open',
  saveProject: 'project:save',
  selectTarget: 'document:select-target',
  selectReferences: 'document:select-references',
  exportPackage: 'package:export',
  validateProject: 'project:validate',
  saveTemplate: 'template:save',
  openTemplate: 'template:open',
  openFolder: 'shell:show-item',
  versions: 'app:versions'
} as const;

const bridge = {
  newProject: (mode: 'existing_document' | 'document_generation') => ipcRenderer.invoke(IPC.newProject, mode),
  openProject: () => ipcRenderer.invoke(IPC.openProject),
  saveProject: (project: unknown, saveAs?: boolean) => ipcRenderer.invoke(IPC.saveProject, project, saveAs),
  selectTarget: () => ipcRenderer.invoke(IPC.selectTarget),
  selectReferences: () => ipcRenderer.invoke(IPC.selectReferences),
  exportPackage: (project: unknown) => ipcRenderer.invoke(IPC.exportPackage, project),
  validateProject: (project: unknown) => ipcRenderer.invoke(IPC.validateProject, project),
  saveTemplate: (project: unknown) => ipcRenderer.invoke(IPC.saveTemplate, project),
  openTemplate: () => ipcRenderer.invoke(IPC.openTemplate),
  openFolder: (path: string) => ipcRenderer.invoke(IPC.openFolder, path),
  getVersions: () => ipcRenderer.invoke(IPC.versions)
};

contextBridge.exposeInMainWorld('checklistMaker', bridge);
