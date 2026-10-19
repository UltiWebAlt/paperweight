
import fs from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'

const baseFolder = 'src/content'

export interface Guide {
  slug: string
  title: string
  description: string
  last_updated: string
  body: string
}

export function GetGuides() {
  const dir = join(process.cwd(), baseFolder, 'guides')
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter(i => i.isFile() && i.name.endsWith('.md'))

  const items = files.map(i => {
    const fullPath = join(dir, i.name)
    const content = fs.readFileSync(fullPath, 'utf8')
    if (!content) {
      console.log('File has no content..', i.name)
    }

    if (content) {
      const doc = matter(content)
      if (!doc.data.last_updated) {
        throw new Error(`Guide ${i.name} is missing last_updated in frontmatter`)
      }
      const lastUpdated =
        doc.data.last_updated instanceof Date
          ? doc.data.last_updated.toISOString().slice(0, 10)
          : String(doc.data.last_updated)
      return {
        ...doc.data,
        last_updated: lastUpdated,
        slug: i.name.replace('.md', ''),
        body: doc.content
      }
    }
  }).filter(i => !!i) as Array<Guide>

  return items.sort((a, b) => b.last_updated.localeCompare(a.last_updated))
}

export function GetGuide(slug: string) {
  return GetGuides().find((guide) => guide.slug === slug);
}