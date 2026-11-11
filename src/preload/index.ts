import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ChiefApi, TaskEvent } from '../shared/types'

const api: ChiefApi = {
  version: () => ipcRenderer.invoke('chief:version'),
  scan: () => ipcRenderer.invoke('chief:scan'),
  task: (request) => ipcRenderer.invoke('chief:task', request),
  onTaskEvent: (listener) => {
    const wrapped = (_event: IpcRendererEvent, taskEvent: TaskEvent): void => listener(taskEvent)
    ipcRenderer.on('chief:task-event', wrapped)
    return () => {
      ipcRenderer.removeListener('chief:task-event', wrapped)
    }
  },
  openExternal: (url) => ipcRenderer.invoke('chief:open-external', url)
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('chief', api)
} else {
  ;(window as unknown as { chief: ChiefApi }).chief = api
}
