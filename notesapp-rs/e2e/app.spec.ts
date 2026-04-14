/**
 * Basic app functionality — no remoteStorage connection required.
 * Tests local-first behaviour: create, edit, archive, delete notes.
 */

import { test, expect } from '@playwright/test'

test.describe('note list', () => {
  test('shows empty state on first visit', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=No notes yet')).toBeVisible()
  })

  test('creates a new note and navigates to editor', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-testid="new-note-btn"]')
    await expect(page).toHaveURL(/\/notes\//)
    await expect(page.locator('[data-testid="note-title"]')).toBeVisible()
  })

  test('note appears in list after creation', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-testid="new-note-btn"]')

    // Set a title
    await page.fill('[data-testid="note-title"]', 'My First Note')

    // Navigate back
    await page.click('[data-testid="back-btn"]')

    await expect(page.locator('[data-testid="note-list"]')).toContainText('My First Note')
  })

  test('search filters notes by title', async ({ page }) => {
    await page.goto('/')

    // Create two notes
    await page.click('[data-testid="new-note-btn"]')
    await page.fill('[data-testid="note-title"]', 'Alpha note')
    await page.click('[data-testid="back-btn"]')

    await page.click('[data-testid="new-note-btn"]')
    await page.fill('[data-testid="note-title"]', 'Beta note')
    await page.click('[data-testid="back-btn"]')

    // Search for "alpha"
    await page.fill('[data-testid="search-input"]', 'alpha')
    await expect(page.locator('[data-testid="note-list"]')).toContainText('Alpha note')
    await expect(page.locator('[data-testid="note-list"]')).not.toContainText('Beta note')
  })
})

test.describe('note editor', () => {
  test('saves title changes', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-testid="new-note-btn"]')

    await page.fill('[data-testid="note-title"]', 'Edited Title')
    await page.click('[data-testid="back-btn"]')

    await expect(page.locator('[data-testid="note-list"]')).toContainText('Edited Title')
  })

  test('saves body content', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-testid="new-note-btn"]')
    await page.fill('[data-testid="note-title"]', 'Body Test')

    // Type into CodeMirror editor
    await page.locator('[data-testid="note-body"] .cm-content').click()
    await page.keyboard.type('Hello world')

    await page.click('[data-testid="back-btn"]')

    // Body preview shows in list
    await expect(page.locator('[data-testid="note-list"]')).toContainText('Hello world')
  })

  test('persists data after page reload', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-testid="new-note-btn"]')
    await page.fill('[data-testid="note-title"]', 'Persist Me')
    await page.click('[data-testid="back-btn"]')

    await page.reload()
    await expect(page.locator('[data-testid="note-list"]')).toContainText('Persist Me')
  })

  test('archives note — removes from list', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-testid="new-note-btn"]')
    await page.fill('[data-testid="note-title"]', 'To Archive')

    await page.click('[data-testid="archive-btn"]')
    await expect(page).toHaveURL('/')
    await expect(page.locator('[data-testid="note-list"]')).not.toContainText('To Archive')
  })

  test('deletes note — removes from list', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-testid="new-note-btn"]')
    await page.fill('[data-testid="note-title"]', 'To Delete')

    // Playwright auto-accepts window.confirm dialogs
    page.on('dialog', (d) => d.accept())
    await page.click('[data-testid="delete-btn"]')

    await expect(page).toHaveURL('/')
    await expect(page.locator('[data-testid="note-list"]')).not.toContainText('To Delete')
  })
})
