import { ipcMain, shell } from 'electron'
import { scanAll } from '../core/scan'
import { runTask } from '../core/tasks'
import { ExternalUrlSchema, TaskRequestSchema } from '../shared/schemas'

export function registerIpc(): void {
  ipcMain.handle('chief:scan', async () => scanAll())

  ipcMain.handle('chief:task', async (event, raw) => {
    const request = TaskRequestSchema.parse(raw)

    return runTask(request, (taskEvent) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('chief:task-event', taskEvent)
      }
    })
  })

  ipcMain.handle('chief:open-external', async (_event, raw) => {
    const url = ExternalUrlSchema.parse(raw)
    await shell.openExternal(url)
  })
}