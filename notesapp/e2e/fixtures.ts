import { test as base, type Page, type BrowserContext } from '@playwright/test'
import { RsServer } from './helpers/rs-server'

type Fixtures = {
  rsServer: RsServer
  connectToRS: (page: Page, username: string) => Promise<void>
}

export const test = base.extend<Fixtures>({
  rsServer: async ({}, use) => {
    const server = new RsServer()
    await server.start()
    await use(server)
    await server.stop()
  },

  /**
   * Automate the remoteStorage widget connect flow:
   *   1. Click the RS widget bubble to open it
   *   2. Type user@127.0.0.1:PORT into the address input
   *   3. Submit — triggers WebFinger fetch + OAuth redirect
   *   4. Our test server auto-accepts OAuth and redirects back
   *   5. Wait for the connected state (widget shows disconnect option)
   */
  connectToRS: async ({ rsServer }, use) => {
    const connect = async (page: Page, username: string) => {
      const address = `${username}@127.0.0.1:${rsServer.port}`

      // The RS widget floats bottom-right. Click the cube icon to open.
      await page.locator('#remotestorage-widget').click()

      // Fill the address input (may need a moment to appear)
      const input = page.locator('#remotestorage-widget input[type="text"]')
      await input.waitFor({ state: 'visible', timeout: 5000 })
      await input.fill(address)

      // Submit — this will trigger a page navigation through OAuth redirect
      await Promise.all([
        page.waitForURL(/localhost/, { timeout: 10000 }),
        page.keyboard.press('Enter'),
      ])

      // The app exposes its own connection state in the status bar once the
      // remoteStorage `connected` event fires.
      await page.locator('.fixed.bottom-0.left-0').getByText('↑').waitFor({ timeout: 10000 })
    }

    await use(connect)
  },
})

export { expect } from '@playwright/test'

/** Helper to open a fresh isolated browser context with a new page at '/' */
export async function newPage(context: BrowserContext) {
  const page = await context.newPage()
  await page.goto('/')
  return page
}
