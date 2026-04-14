/**
 * Cross-browser sync tests.
 *
 * Each test uses two isolated browser contexts (A and B) connected to the
 * same in-memory remoteStorage server.  After a write on one side we wait
 * for the RS library's sync cycle (≤ 4 s) to propagate changes to the other.
 *
 * Timing budget per propagation:
 *   1 s  — schedulePush debounce
 *   2 s  — remotestoragejs setSyncInterval polls the server
 *   1 s  — React re-render
 *   ─────
 *   ≤ 4 s (we wait up to 10 s to be safe)
 */

import { test, expect } from './fixtures'

const SYNC_TIMEOUT = 10_000

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Connect the page to the test RS server and wait for the connected state. */
async function connectRS(
  page: import('@playwright/test').Page,
  connectToRS: (page: import('@playwright/test').Page, username: string) => Promise<void>,
  username: string
) {
  await connectToRS(page, username)
}

/** Wait for the status bar to show an upload timestamp (↑), meaning at least
 *  one push has completed. */
async function waitForPush(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => {
      const bar = document.querySelector('.fixed.bottom-0.left-0')
      return bar?.textContent?.includes('↑') && !bar.textContent.includes('↑ —')
    },
    { timeout: SYNC_TIMEOUT }
  )
}

// ─── tests ─────────────────────────────────────────────────────────────────────

test.describe('cross-browser sync', () => {
  test('note created in A appears in B after sync', async ({
    browser,
    rsServer,
    connectToRS,
    page,
  }) => {
    // Browser A is the default `page` fixture
    await page.goto('/')
    await connectRS(page, connectToRS, 'syncuser')

    // Browser B — isolated context (separate IndexedDB / localStorage)
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    await pageB.goto('/')
    await connectRS(pageB, connectToRS, 'syncuser')

    // A creates a note
    await page.click('[data-testid="new-note-btn"]')
    await page.fill('[data-testid="note-title"]', 'Sync Test Note')
    await page.locator('[data-testid="note-body"] .cm-content').click()
    await page.keyboard.type('Written by A')

    // Wait for A to push
    await page.click('[data-testid="back-btn"]')
    await waitForPush(page)

    // B should see the note — pullAndMerge fires on onRemoteChange or reconnect
    await expect(pageB.locator('[data-testid="note-list"]')).toContainText('Sync Test Note', {
      timeout: SYNC_TIMEOUT,
    })

    await ctxB.close()
  })

  test('edit in B syncs back to A', async ({ browser, rsServer, connectToRS, page }) => {
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()

    await page.goto('/')
    await pageB.goto('/')
    await connectRS(page, connectToRS, 'edituser')
    await connectRS(pageB, connectToRS, 'edituser')

    // A creates a note
    await page.click('[data-testid="new-note-btn"]')
    await page.fill('[data-testid="note-title"]', 'Original Title')
    await page.click('[data-testid="back-btn"]')
    await waitForPush(page)

    // B waits for the note then edits it
    await expect(pageB.locator('[data-testid="note-list"]')).toContainText('Original Title', {
      timeout: SYNC_TIMEOUT,
    })
    await pageB.locator('[data-testid="note-item"]', { hasText: 'Original Title' }).click()
    await pageB.fill('[data-testid="note-title"]', 'Edited by B')
    await pageB.click('[data-testid="back-btn"]')
    await waitForPush(pageB)

    // A should now see the updated title
    await expect(page.locator('[data-testid="note-list"]')).toContainText('Edited by B', {
      timeout: SYNC_TIMEOUT,
    })

    await ctxB.close()
  })

  test('body edit in A appears in B without reload', async ({ browser, connectToRS, page }) => {
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()

    await page.goto('/')
    await pageB.goto('/')
    await connectRS(page, connectToRS, 'bodysyncuser')
    await connectRS(pageB, connectToRS, 'bodysyncuser')

    await page.click('[data-testid="new-note-btn"]')
    await page.fill('[data-testid="note-title"]', 'Shared Body')
    await page.locator('[data-testid="note-body"] .cm-content').click()
    await page.keyboard.type('alpha beta')
    await page.click('[data-testid="back-btn"]')
    await waitForPush(page)

    await expect(pageB.locator('[data-testid="note-list"]')).toContainText('Shared Body', {
      timeout: SYNC_TIMEOUT,
    })
    await pageB.locator('[data-testid="note-item"]', { hasText: 'Shared Body' }).click()

    await page.locator('[data-testid="note-item"]', { hasText: 'Shared Body' }).click()
    await page.locator('[data-testid="note-body"] .cm-content').fill('alpha beta gamma')
    await waitForPush(page)

    await expect(pageB.locator('[data-testid="note-body"] .cm-content')).toContainText('alpha beta gamma', {
      timeout: SYNC_TIMEOUT,
    })

    await ctxB.close()
  })

  test('deletion in A removes note from B', async ({ browser, rsServer, connectToRS, page }) => {
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()

    await page.goto('/')
    await pageB.goto('/')
    await connectRS(page, connectToRS, 'deluser')
    await connectRS(pageB, connectToRS, 'deluser')

    // A creates a note
    await page.click('[data-testid="new-note-btn"]')
    await page.fill('[data-testid="note-title"]', 'Will Be Deleted')
    await page.click('[data-testid="back-btn"]')
    await waitForPush(page)

    // B waits to see it
    await expect(pageB.locator('[data-testid="note-list"]')).toContainText('Will Be Deleted', {
      timeout: SYNC_TIMEOUT,
    })

    // A deletes the note
    await page.locator('[data-testid="note-item"]', { hasText: 'Will Be Deleted' }).click()
    page.on('dialog', (d) => d.accept())
    await page.click('[data-testid="delete-btn"]')
    await waitForPush(page) // pushes tombstone

    // B should no longer see the note
    await expect(pageB.locator('[data-testid="note-list"]')).not.toContainText('Will Be Deleted', {
      timeout: SYNC_TIMEOUT,
    })

    await ctxB.close()
  })

  test('incoming highlight appears only on the receiving editor', async ({ browser, connectToRS, page }) => {
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()

    await page.goto('/')
    await pageB.goto('/')
    await connectRS(page, connectToRS, 'highlightuser')
    await connectRS(pageB, connectToRS, 'highlightuser')

    await page.click('[data-testid="new-note-btn"]')
    await page.fill('[data-testid="note-title"]', 'Highlight Note')
    await page.locator('[data-testid="note-body"] .cm-content').click()
    await page.keyboard.type('hello world')
    await waitForPush(page)

    await page.click('[data-testid="back-btn"]')
    await expect(pageB.locator('[data-testid="note-list"]')).toContainText('Highlight Note', {
      timeout: SYNC_TIMEOUT,
    })

    await page.locator('[data-testid="note-item"]', { hasText: 'Highlight Note' }).click()
    await pageB.locator('[data-testid="note-item"]', { hasText: 'Highlight Note' }).click()

    await page.locator('[data-testid="note-body"] .cm-content').click()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
    await page.keyboard.type('hello brave world')
    await waitForPush(page)

    await expect(page.locator('.cm-incoming-change')).toHaveCount(0)
    await expect(pageB.locator('.cm-incoming-change').first()).toBeVisible({
      timeout: SYNC_TIMEOUT,
    })

    await ctxB.close()
  })

  test('body deletion converges and does not bounce back', async ({ browser, connectToRS, page }) => {
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()

    await page.goto('/')
    await pageB.goto('/')
    await connectRS(page, connectToRS, 'deleteworduser')
    await connectRS(pageB, connectToRS, 'deleteworduser')

    await page.click('[data-testid="new-note-btn"]')
    await page.fill('[data-testid="note-title"]', 'Delete Word')
    await page.locator('[data-testid="note-body"] .cm-content').click()
    await page.keyboard.type('alpha beta gamma')
    await waitForPush(page)

    await page.click('[data-testid="back-btn"]')
    await expect(pageB.locator('[data-testid="note-list"]')).toContainText('Delete Word', {
      timeout: SYNC_TIMEOUT,
    })

    await page.locator('[data-testid="note-item"]', { hasText: 'Delete Word' }).click()
    await pageB.locator('[data-testid="note-item"]', { hasText: 'Delete Word' }).click()

    await page.locator('[data-testid="note-body"] .cm-content').fill('alpha gamma')
    await waitForPush(page)

    await expect(pageB.locator('[data-testid="note-body"] .cm-content')).toContainText('alpha gamma', {
      timeout: SYNC_TIMEOUT,
    })
    await expect(pageB.locator('[data-testid="note-body"] .cm-content')).not.toContainText('beta', {
      timeout: SYNC_TIMEOUT,
    })

    await page.waitForTimeout(6000)
    await expect(page.locator('[data-testid="note-body"] .cm-content')).toContainText('alpha gamma')
    await expect(page.locator('[data-testid="note-body"] .cm-content')).not.toContainText('beta')

    await ctxB.close()
  })

  test('concurrent body edits merge after reconnect', async ({ browser, connectToRS, page }) => {
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()

    await page.goto('/')
    await pageB.goto('/')
    await connectRS(page, connectToRS, 'mergeuser')
    await connectRS(pageB, connectToRS, 'mergeuser')

    await page.click('[data-testid="new-note-btn"]')
    await page.fill('[data-testid="note-title"]', 'Merge Note')
    await page.locator('[data-testid="note-body"] .cm-content').click()
    await page.keyboard.type('alpha beta')
    await page.click('[data-testid="back-btn"]')
    await waitForPush(page)

    await expect(pageB.locator('[data-testid="note-list"]')).toContainText('Merge Note', {
      timeout: SYNC_TIMEOUT,
    })
    await pageB.locator('[data-testid="note-item"]', { hasText: 'Merge Note' }).click()
    await expect(pageB.locator('[data-testid="note-body"] .cm-content')).toContainText('alpha beta', {
      timeout: SYNC_TIMEOUT,
    })

    await pageB.context().setOffline(true)

    await page.locator('[data-testid="note-item"]', { hasText: 'Merge Note' }).click()
    await page.locator('[data-testid="note-body"] .cm-content').fill('alpha ')
    await waitForPush(page)

    await pageB.locator('[data-testid="note-body"] .cm-content').fill('alpha Xbeta')

    await pageB.context().setOffline(false)
    await pageB.reload()
    await connectRS(pageB, connectToRS, 'mergeuser')

    await expect(pageB.locator('[data-testid="note-body"] .cm-content')).toContainText('alpha X', {
      timeout: SYNC_TIMEOUT,
    })
    await expect(pageB.locator('[data-testid="note-body"] .cm-content')).not.toContainText('beta', {
      timeout: SYNC_TIMEOUT,
    })
    await expect(page.locator('[data-testid="note-body"] .cm-content')).toContainText('alpha X', {
      timeout: SYNC_TIMEOUT,
    })
    await expect(page.locator('[data-testid="note-body"] .cm-content')).not.toContainText('beta', {
      timeout: SYNC_TIMEOUT,
    })

    await ctxB.close()
  })

  test('conflict: last-write wins by updatedAt', async ({
    browser,
    rsServer,
    connectToRS,
    page,
  }) => {
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()

    await page.goto('/')
    await pageB.goto('/')
    await connectRS(page, connectToRS, 'conflictuser')
    await connectRS(pageB, connectToRS, 'conflictuser')

    // A creates a note
    await page.click('[data-testid="new-note-btn"]')
    await page.fill('[data-testid="note-title"]', 'Shared Note')
    await page.click('[data-testid="back-btn"]')
    await waitForPush(page)

    // Both sync the note
    await expect(pageB.locator('[data-testid="note-list"]')).toContainText('Shared Note', {
      timeout: SYNC_TIMEOUT,
    })

    // B edits, waits, then A edits again (A's write is newer)
    await pageB.locator('[data-testid="note-item"]', { hasText: 'Shared Note' }).click()
    await pageB.fill('[data-testid="note-title"]', 'B Version')
    await pageB.click('[data-testid="back-btn"]')
    await waitForPush(pageB)

    // A waits for B's version then overwrites
    await expect(page.locator('[data-testid="note-list"]')).toContainText('B Version', {
      timeout: SYNC_TIMEOUT,
    })
    await page.locator('[data-testid="note-item"]', { hasText: 'B Version' }).click()
    await page.fill('[data-testid="note-title"]', 'A Wins')
    await page.click('[data-testid="back-btn"]')
    await waitForPush(page)

    // B should converge on A's version
    await expect(pageB.locator('[data-testid="note-list"]')).toContainText('A Wins', {
      timeout: SYNC_TIMEOUT,
    })

    await ctxB.close()
  })
})
