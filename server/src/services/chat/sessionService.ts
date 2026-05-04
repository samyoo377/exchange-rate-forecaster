import { prisma } from "../../utils/db.js"

export async function createSession(scope: "web" | "admin", symbol = "USDCNH", horizon = "T+2") {
  return prisma.chatSession.create({
    data: { scope, symbol, horizon },
  })
}

export async function listSessions(scope: "web" | "admin", limit = 50) {
  return prisma.chatSession.findMany({
    where: { scope },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      symbol: true,
      horizon: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function getSessionWithMessages(sessionId: string) {
  return prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  })
}

export async function deleteSession(sessionId: string) {
  return prisma.chatSession.delete({ where: { id: sessionId } })
}

export async function addMessage(
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string,
  attachmentIds?: string[],
) {
  const msg = await prisma.chatMessage.create({
    data: {
      sessionId,
      role,
      content,
      attachments: attachmentIds?.length ? JSON.stringify(attachmentIds) : null,
    },
  })

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  })

  return msg
}

export async function generateSessionTitle(sessionId: string, firstMessage: string) {
  const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "")
  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { title },
  })
}

export async function getSessionHistory(sessionId: string): Promise<{ role: string; content: string }[]> {
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  })
  return messages
}
