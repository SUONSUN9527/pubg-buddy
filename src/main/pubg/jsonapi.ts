/** JSON:API 文档的轻量解析:不引库,只做本项目用到的取数动作 */

export interface Resource {
  type: string
  id: string
  attributes?: Record<string, unknown>
  relationships?: Record<string, { data: { type: string; id: string } | Array<{ type: string; id: string }> | null }>
}

export interface Doc {
  data: Resource | Resource[]
  included?: Resource[]
  meta?: unknown
  links?: unknown
}

export function one(doc: Doc): Resource {
  if (Array.isArray(doc.data)) {
    if (doc.data.length === 0) throw new Error('JSON:API 文档 data 为空数组')
    return doc.data[0]
  }
  return doc.data
}

export function many(doc: Doc): Resource[] {
  return Array.isArray(doc.data) ? doc.data : [doc.data]
}

/** included 资源按 "type:id" 建索引,供 O(1) 解引用 */
export function includedIndex(doc: Doc): Map<string, Resource> {
  const map = new Map<string, Resource>()
  for (const res of doc.included ?? []) map.set(`${res.type}:${res.id}`, res)
  return map
}

/** 取某个关系的全部 id(单值关系归一为数组) */
export function relIds(res: Resource, relName: string): string[] {
  const data = res.relationships?.[relName]?.data
  if (!data) return []
  return (Array.isArray(data) ? data : [data]).map((d) => d.id)
}
