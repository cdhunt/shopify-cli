import {draftExtensionsPush} from './push.js'
import {DraftExtensionsPushOptions, enableDeveloperPreview, ensureDraftExtensionsPushContext} from '../context.js'
import {updateExtensionDraft} from '../dev/update-extension.js'
import {buildFunctionExtension, buildUIExtension} from '../build/extension.js'
import {
  testApp,
  testUIExtension,
  testPartnersUserSession,
  testFunctionExtension,
} from '../../models/app/app.test-data.js'
import {AppInterface} from '../../models/app/app.js'
import {describe, expect, test, vi} from 'vitest'
import {Config} from '@oclif/core'
import {exec} from '@shopify/cli-kit/node/system'

vi.mock('../context.js')
vi.mock('../build/extension.js')
vi.mock('../dev/update-extension.js')
vi.mock('@shopify/cli-kit/node/system')

const COMMAND_CONFIG = {runHook: vi.fn(() => Promise.resolve({successes: []}))} as unknown as Config

const draftExtensionsPushOptions = (app: AppInterface): DraftExtensionsPushOptions => {
  return {
    directory: app.directory,
    reset: false,
    commandConfig: COMMAND_CONFIG,
    enableDeveloperPreview: false,
  }
}
const validUiExtension = await testUIExtension({
  configuration: {
    extension_points: [],
    type: 'ui_extension',
    handle: 'ui_extension_identifier',
  },
})
const validFunctionExtension = await testFunctionExtension({
  config: {
    name: 'jsfunction',
    type: 'function',
    api_version: '2023-07',
    configuration_ui: true,
    metafields: [],
    build: {},
  },
  entryPath: 'src/index.js',
})
const remoteExtensionIds = {
  ui_extension_identifier: 'remote-ui-extension-id',
  jsfunction: 'remote-function-extension-id',
}
const remoteApp = {
  id: 'app-id',
  title: 'app-title',
  apiKey: 'api-key',
  organizationId: 'org-id',
  grantedScopes: [],
  applicationUrl: 'https://example.com',
  redirectUrlWhitelist: [],
  apiSecretKeys: [],
}

describe('draftExtensionsPush', () => {
  test("do nothing if the app doesn't include any extension", async () => {
    // Given
    const app = testApp({
      allExtensions: [],
    })
    vi.mocked(ensureDraftExtensionsPushContext).mockResolvedValue({
      app,
      partnersSession: testPartnersUserSession,
      remoteExtensionIds,
      remoteApp,
    })

    // When
    await draftExtensionsPush(draftExtensionsPushOptions(app))

    // Then
    expect(updateExtensionDraft).not.toHaveBeenCalledOnce()
    expect(enableDeveloperPreview).not.toHaveBeenCalled()
  })

  test('build and deploy draft content with ui extension', async () => {
    // Given
    const app = testApp({
      allExtensions: [validUiExtension],
    })
    vi.mocked(ensureDraftExtensionsPushContext).mockResolvedValue({
      app,
      partnersSession: testPartnersUserSession,
      remoteExtensionIds,
      remoteApp,
    })
    vi.mocked(buildUIExtension).mockResolvedValue()
    vi.mocked(updateExtensionDraft).mockResolvedValue()

    // When
    await draftExtensionsPush(draftExtensionsPushOptions(app))

    // Then
    expect(updateExtensionDraft).toHaveBeenCalledOnce()
    expect(enableDeveloperPreview).not.toHaveBeenCalled()
  })

  test('install javy, build and deploy draft content with a js function extension', async () => {
    // Given
    const app = testApp({
      allExtensions: [validFunctionExtension],
    })
    vi.mocked(ensureDraftExtensionsPushContext).mockResolvedValue({
      app,
      partnersSession: testPartnersUserSession,
      remoteExtensionIds,
      remoteApp,
    })
    vi.mocked(buildFunctionExtension).mockResolvedValue()
    vi.mocked(updateExtensionDraft).mockResolvedValue()

    // When
    await draftExtensionsPush(draftExtensionsPushOptions(app))

    // Then
    expect(vi.mocked(exec)).toHaveBeenCalledWith('npm', ['exec', '--', 'javy', '--version'], {cwd: app.directory})
    expect(updateExtensionDraft).toHaveBeenCalledOnce()
    expect(enableDeveloperPreview).not.toHaveBeenCalled()
  })

  test('enabled develop preview if the flag is used', async () => {
    // Given
    const app = testApp({
      allExtensions: [],
    })
    vi.mocked(ensureDraftExtensionsPushContext).mockResolvedValue({
      app,
      partnersSession: testPartnersUserSession,
      remoteExtensionIds,
      remoteApp,
    })

    // When
    await draftExtensionsPush({...draftExtensionsPushOptions(app), enableDeveloperPreview: true})

    // Then
    expect(updateExtensionDraft).not.toHaveBeenCalledOnce()
    expect(enableDeveloperPreview).toHaveBeenCalled()
  })
})
