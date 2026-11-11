import { z } from 'zod'
import { MANAGER_IDS } from './types'

const SAFE_ARGUMENT = /^[A-Za-z0-9@._/+:@~-]+$/

export const TaskRequestSchema = z
  .object({
    type: z.enum(['update', 'uninstall', 'update-all']),
    manager: z.enum(MANAGER_IDS),
    packageId: z
      .string()
      .min(1)
      .max(500)
      .regex(SAFE_ARGUMENT, '包名包含不支持的字符')
      .optional(),
    /** 仅用于 update-all：限定在一个全局安装目录内 */
    installRoot: z.string().min(1).max(1000).optional()
  })
  .refine((value) => value.type === 'update-all' || Boolean(value.packageId), {
    message: '单个包操作必须提供 packageId'
  })

export const ExternalUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://') || value.startsWith('http://'), {
    message: '只允许打开 http/https 链接'
  })