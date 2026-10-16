// tokenfunc 二开翻译：与上游 locale 文件分离，初始化时浅合并进同一 translation namespace。
// 二开条目在后展开，因此可以覆盖上游同名 key 的译文。
// 新增 key 时七个语言文件必须同时写入（至少 en 与 zh），否则 i18n:sync 会把孤立 key 挪进 _extras。
import type { resources as upstreamResources } from '../config'
import en from '../locales/tokenfunc/en.json'
import fr from '../locales/tokenfunc/fr.json'
import ja from '../locales/tokenfunc/ja.json'
import ru from '../locales/tokenfunc/ru.json'
import vi from '../locales/tokenfunc/vi.json'
import zhTW from '../locales/tokenfunc/zh-TW.json'
import zhCN from '../locales/tokenfunc/zh.json'

const tokenfuncResources = { en, zhCN, fr, ru, ja, vi, zhTW } as const

type UpstreamResources = typeof upstreamResources

export function withTokenfunc(upstream: UpstreamResources): UpstreamResources {
  const merged = {} as Record<string, { translation: Record<string, string> }>
  for (const lang of Object.keys(upstream) as Array<keyof UpstreamResources>) {
    merged[lang] = {
      translation: {
        ...upstream[lang].translation,
        ...tokenfuncResources[lang].translation,
      },
    }
  }
  return merged as unknown as UpstreamResources
}
