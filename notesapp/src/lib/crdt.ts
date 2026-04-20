import * as Y from 'yjs'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function createDocFromState(crdtState?: string): Y.Doc {
  const doc = new Y.Doc()
  if (crdtState) {
    Y.applyUpdate(doc, base64ToBytes(crdtState))
  }
  return doc
}

export function createBodyState(text: string): string {
  const doc = new Y.Doc()
  doc.getText('body').insert(0, text)
  return bytesToBase64(Y.encodeStateAsUpdate(doc))
}

export function getTextFromBodyState(crdtState: string): string {
  return createDocFromState(crdtState).getText('body').toString()
}

export function replaceBodyText(crdtState: string | undefined, nextText: string): string {
  const doc = createDocFromState(crdtState)
  const text = doc.getText('body')
  const currentText = text.toString()

  let prefixLen = 0
  const maxPrefix = Math.min(currentText.length, nextText.length)
  while (prefixLen < maxPrefix && currentText[prefixLen] === nextText[prefixLen]) {
    prefixLen++
  }

  let suffixLen = 0
  const maxSuffix = Math.min(currentText.length - prefixLen, nextText.length - prefixLen)
  while (
    suffixLen < maxSuffix &&
    currentText[currentText.length - 1 - suffixLen] === nextText[nextText.length - 1 - suffixLen]
  ) {
    suffixLen++
  }

  const deleteCount = currentText.length - prefixLen - suffixLen
  const insertText = nextText.slice(prefixLen, nextText.length - suffixLen)

  doc.transact(() => {
    if (deleteCount > 0) {
      text.delete(prefixLen, deleteCount)
    }
    if (insertText) {
      text.insert(prefixLen, insertText)
    }
  })
  return bytesToBase64(Y.encodeStateAsUpdate(doc))
}

export function mergeBodyStates(localState: string | undefined, remoteState: string | undefined): string {
  const doc = createDocFromState(localState)
  if (remoteState) {
    Y.applyUpdate(doc, base64ToBytes(remoteState))
  }
  return bytesToBase64(Y.encodeStateAsUpdate(doc))
}
