import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"
import { prisma } from "../../utils/db.js"

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads")

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])

export function isImageMime(mime: string): boolean {
  return IMAGE_MIMES.has(mime)
}

export async function saveUploadedFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  sessionId?: string,
): Promise<{ id: string; storedPath: string; originalName: string; mimeType: string }> {
  const ext = path.extname(originalName) || ".bin"
  const hash = crypto.randomBytes(8).toString("hex")
  const fileName = `${Date.now()}-${hash}${ext}`
  const storedPath = path.join(UPLOADS_DIR, fileName)

  fs.writeFileSync(storedPath, buffer)

  const record = await prisma.uploadedFile.create({
    data: {
      originalName,
      storedPath: fileName,
      mimeType,
      sizeBytes: buffer.length,
      sessionId,
    },
  })

  return { id: record.id, storedPath: fileName, originalName, mimeType }
}

export async function getFileAsBase64(fileId: string): Promise<{ base64: string; mimeType: string } | null> {
  const record = await prisma.uploadedFile.findUnique({ where: { id: fileId } })
  if (!record) return null

  const fullPath = path.join(UPLOADS_DIR, record.storedPath)
  if (!fs.existsSync(fullPath)) return null

  const buffer = fs.readFileSync(fullPath)
  return { base64: buffer.toString("base64"), mimeType: record.mimeType }
}

export async function extractTextFromFile(fileId: string): Promise<string | null> {
  const record = await prisma.uploadedFile.findUnique({ where: { id: fileId } })
  if (!record) return null

  const fullPath = path.join(UPLOADS_DIR, record.storedPath)
  if (!fs.existsSync(fullPath)) return null

  if (record.mimeType.startsWith("text/") || record.mimeType === "application/json") {
    return fs.readFileSync(fullPath, "utf-8")
  }

  return null
}

export function getUploadsDir(): string {
  return UPLOADS_DIR
}
