import {ensureDeployContext} from './context.js'
import {deploy} from './deploy.js'
import {uploadWasmBlob, uploadExtensionsBundle, uploadFunctionExtensions} from './deploy/upload.js'
import {fetchAppExtensionRegistrations} from './dev/fetch.js'
import {bundleAndBuildExtensions} from './deploy/bundle.js'
import {
  testApp,
  testFunctionExtension,
  testThemeExtensions,
  testUIExtension,
  testOrganizationApp,
  getWebhookConfig,
} from '../models/app/app.test-data.js'
import {updateAppIdentifiers} from '../models/app/identifiers.js'
import {AppInterface} from '../models/app/app.js'
import {OrganizationApp} from '../models/organization.js'
import {fakedWebhookSubscriptionsMutation} from '../utilities/app/config/webhooks.js'
import {beforeEach, describe, expect, vi, test} from 'vitest'
import {useThemebundling} from '@shopify/cli-kit/node/context/local'
import {renderInfo, renderSuccess, renderTasks, renderTextPrompt, Task} from '@shopify/cli-kit/node/ui'
import {formatPackageManagerCommand} from '@shopify/cli-kit/node/output'
import {Config} from '@oclif/core'

const versionTag = 'unique-version-tag'

vi.mock('../utilities/app/config/webhooks.js', async () => ({
  ...((await vi.importActual('../utilities/app/config/webhooks.js')) as any),
  fakedWebhookSubscriptionsMutation: vi.fn(),
}))
vi.mock('./context.js')
vi.mock('./deploy/upload.js')
vi.mock('./deploy/bundle.js')
vi.mock('./dev/fetch.js')
vi.mock('../models/app/identifiers.js')
vi.mock('@shopify/cli-kit/node/context/local')
vi.mock('@shopify/cli-kit/node/ui')
vi.mock('../validators/extensions.js')
vi.mock('./context/prompts')

beforeEach(() => {
  // this is needed because using importActual to mock the ui module
  // creates a circular dependency between ui and context/local
  // so we need to mock the whole module and just replace the functions we use
  vi.mocked(renderTasks).mockImplementation(async (tasks: Task[]) => {
    for (const task of tasks) {
      // eslint-disable-next-line no-await-in-loop
      await task.task({}, task)
    }
  })
})

describe('deploy', () => {
  test('passes release to uploadExtensionsBundle()', async () => {
    // Given
    const app = testApp({allExtensions: []})
    vi.mocked(renderTextPrompt).mockResolvedValue('Deployed from CLI')

    // When
    await testDeployBundle({
      app,
      partnersApp: {
        id: 'app-id',
        organizationId: 'org-id',
        applicationUrl: 'https://my-app.com',
        redirectUrlWhitelist: ['https://my-app.com/auth'],
        title: 'app-title',
        grantedScopes: [],
      },
      options: {
        noRelease: false,
      },
    })

    // Then
    expect(uploadExtensionsBundle).toHaveBeenCalledWith({
      apiKey: 'app-id',
      appModules: [],
      token: 'api-token',
      extensionIds: {},
      release: true,
    })
  })

  test('passes a message to uploadExtensionsBundle() when a message arg is present', async () => {
    // Given
    const app = testApp()

    // When
    await testDeployBundle({
      app,
      partnersApp: {
        id: 'app-id',
        organizationId: 'org-id',
        applicationUrl: 'https://my-app.com',
        redirectUrlWhitelist: ['https://my-app.com/auth'],
        title: 'app-title',
        grantedScopes: [],
      },
      options: {
        message: 'Deployed from CLI with flag',
      },
    })

    // Then
    expect(uploadExtensionsBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Deployed from CLI with flag',
      }),
    )
  })

  test('passes a version to uploadExtensionsBundle() when a version arg is present', async () => {
    // Given
    const app = testApp()

    // When
    await testDeployBundle({
      app,
      partnersApp: {
        id: 'app-id',
        organizationId: 'org-id',
        applicationUrl: 'https://my-app.com',
        redirectUrlWhitelist: ['https://my-app.com/auth'],
        title: 'app-title',
        grantedScopes: [],
      },
      options: {
        version: '1.1.0',
      },
    })

    // Then
    expect(uploadExtensionsBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        version: '1.1.0',
      }),
    )
  })

  test('deploys the app with no extensions', async () => {
    const app = testApp({allExtensions: []})
    vi.mocked(renderTextPrompt).mockResolvedValueOnce('')

    // When
    await testDeployBundle({
      app,
      partnersApp: {
        id: 'app-id',
        organizationId: 'org-id',
        applicationUrl: 'https://my-app.com',
        redirectUrlWhitelist: ['https://my-app.com/auth'],
        title: 'app-title',
        grantedScopes: [],
      },
    })

    // Then
    expect(uploadExtensionsBundle).toHaveBeenCalledWith({
      apiKey: 'app-id',
      appModules: [],
      token: 'api-token',
      extensionIds: {},
      release: true,
    })
    expect(bundleAndBuildExtensions).toHaveBeenCalledOnce()
    expect(updateAppIdentifiers).toHaveBeenCalledOnce()
  })

  test('uploads the extension bundle with 1 UI extension', async () => {
    // Given
    const uiExtension = await testUIExtension({type: 'web_pixel_extension'})
    const app = testApp({allExtensions: [uiExtension]})

    // When
    await testDeployBundle({app})

    // Then
    expect(uploadExtensionsBundle).toHaveBeenCalledWith({
      apiKey: 'app-id',
      bundlePath: expect.stringMatching(/bundle.zip$/),
      appModules: [{uuid: uiExtension.localIdentifier, config: '{}', context: '', handle: uiExtension.handle}],
      token: 'api-token',
      extensionIds: {},
      release: true,
    })
    expect(bundleAndBuildExtensions).toHaveBeenCalledOnce()
    expect(updateAppIdentifiers).toHaveBeenCalledOnce()
  })

  test('uploads the extension bundle with 1 theme extension', async () => {
    // Given
    const themeExtension = await testThemeExtensions()
    const app = testApp({allExtensions: [themeExtension]})

    // When
    await testDeployBundle({app})

    // Then
    expect(uploadExtensionsBundle).toHaveBeenCalledWith({
      apiKey: 'app-id',
      bundlePath: expect.stringMatching(/bundle.zip$/),
      appModules: [
        {
          uuid: themeExtension.localIdentifier,
          config: '{"theme_extension":{"files":{}}}',
          context: '',
          handle: themeExtension.handle,
        },
      ],
      token: 'api-token',
      extensionIds: {},
      release: true,
    })
    expect(bundleAndBuildExtensions).toHaveBeenCalledOnce()
    expect(updateAppIdentifiers).toHaveBeenCalledOnce()
  })

  test('uploads the extension bundle with 1 function', async () => {
    // Given
    const functionExtension = await testFunctionExtension()
    vi.spyOn(functionExtension, 'preDeployValidation').mockImplementation(async () => {})

    const app = testApp({allExtensions: [functionExtension]})
    const moduleId = 'module-id'
    const mockedFunctionConfiguration = {
      title: functionExtension.configuration.name,
      module_id: moduleId,
      description: functionExtension.configuration.description,
      app_key: 'app-id',
      api_type: functionExtension.configuration.type,
      api_version: functionExtension.configuration.api_version,
      enable_creation_ui: true,
      localization: {},
    }
    vi.mocked(uploadWasmBlob).mockResolvedValue({url: 'url', moduleId})

    // When
    await testDeployBundle({
      app,
      partnersApp: testOrganizationApp({
        id: 'app-id',
        organizationId: 'org-id',
      }),
    })

    // Then
    expect(uploadExtensionsBundle).toHaveBeenCalledWith({
      apiKey: 'app-id',
      appModules: [
        {
          uuid: functionExtension.localIdentifier,
          config: JSON.stringify(mockedFunctionConfiguration),
          context: '',
          handle: functionExtension.handle,
        },
      ],
      token: 'api-token',
      extensionIds: {},
      bundlePath: undefined,
      release: true,
    })
    expect(bundleAndBuildExtensions).toHaveBeenCalledOnce()
    expect(updateAppIdentifiers).toHaveBeenCalledOnce()
  })

  test('uploads the extension bundle with 1 UI and 1 theme extension', async () => {
    // Given
    const uiExtension = await testUIExtension({type: 'web_pixel_extension'})
    const themeExtension = await testThemeExtensions()
    const app = testApp({allExtensions: [uiExtension, themeExtension]})
    const commitReference = 'https://github.com/deploytest/repo/commit/d4e5ce7999242b200acde378654d62c14b211bcc'

    // When
    await testDeployBundle({app, released: false, commitReference})

    // Then
    expect(uploadExtensionsBundle).toHaveBeenCalledWith({
      apiKey: 'app-id',
      bundlePath: expect.stringMatching(/bundle.zip$/),
      appModules: [
        {uuid: uiExtension.localIdentifier, config: '{}', context: '', handle: uiExtension.handle},
        {
          uuid: themeExtension.localIdentifier,
          config: '{"theme_extension":{"files":{}}}',
          context: '',
          handle: themeExtension.handle,
        },
      ],
      token: 'api-token',
      extensionIds: {},
      release: true,
      commitReference,
    })
    expect(bundleAndBuildExtensions).toHaveBeenCalledOnce()
    expect(updateAppIdentifiers).toHaveBeenCalledOnce()
  })

  test('shows a success message', async () => {
    // Given
    const uiExtension = await testUIExtension({type: 'web_pixel_extension'})
    const app = testApp({allExtensions: [uiExtension]})
    vi.mocked(renderTextPrompt).mockResolvedValue('Deployed from CLI')

    // When
    await testDeployBundle({
      app,
      partnersApp: {
        id: 'app-id',
        organizationId: 'org-id',
        applicationUrl: 'https://my-app.com',
        redirectUrlWhitelist: ['https://my-app.com/auth'],
        title: 'app-title',
        grantedScopes: [],
      },
      options: {
        noRelease: false,
      },
      released: true,
    })

    // Then
    expect(renderSuccess).toHaveBeenCalledWith({
      headline: 'New version released to users.',
      body: [
        {
          link: {
            label: 'unique-version-tag',
            url: 'https://partners.shopify.com/0/apps/0/versions/1',
          },
        },
        '',
      ],
    })
  })

  test('shows a specific success message when there is an error with the release', async () => {
    // Given
    const uiExtension = await testUIExtension({type: 'web_pixel_extension'})
    const app = testApp({allExtensions: [uiExtension]})
    vi.mocked(renderTextPrompt).mockResolvedValue('Deployed from CLI')

    // When
    await testDeployBundle({
      app,
      partnersApp: {
        id: 'app-id2',
        organizationId: 'org-id',
        applicationUrl: 'https://my-app.com',
        redirectUrlWhitelist: ['https://my-app.com/auth'],
        title: 'app-title',
        grantedScopes: [],
      },
      options: {
        noRelease: false,
        message: 'version message',
      },
      released: false,
    })

    // Then
    expect(renderInfo).toHaveBeenCalledWith({
      headline: 'New version created, but not released.',
      body: [
        {
          link: {
            label: 'unique-version-tag',
            url: 'https://partners.shopify.com/0/apps/0/versions/1',
          },
        },
        '\nversion message',
        '\n\nno release error',
      ],
    })
  })

  test('shows a specific success message when deploying --no-release', async () => {
    // Given
    const uiExtension = await testUIExtension({type: 'web_pixel_extension'})
    const app = testApp({allExtensions: [uiExtension]})
    vi.mocked(renderTextPrompt).mockResolvedValue('Deployed from CLI')

    // When
    await testDeployBundle({
      app,
      partnersApp: {
        id: 'app-id',
        organizationId: 'org-id',
        applicationUrl: 'https://my-app.com',
        redirectUrlWhitelist: ['https://my-app.com/auth'],
        title: 'app-title',
        grantedScopes: [],
      },
      options: {
        noRelease: true,
        message: 'version message',
      },
    })

    // Then
    expect(renderSuccess).toHaveBeenCalledWith({
      headline: 'New version created.',
      body: [
        {
          link: {
            label: 'unique-version-tag',
            url: 'https://partners.shopify.com/0/apps/0/versions/1',
          },
        },
        '\nversion message',
      ],
      nextSteps: [
        [
          'Run',
          {command: formatPackageManagerCommand(app.packageManager, 'shopify app release', `--version=${versionTag}`)},
          'to release this version to users.',
        ],
      ],
    })
  })

  describe('declarative webhook subscription config', () => {
    test('does not run the webhook subscription task if the declarativeWebhooks beta is disabled', async () => {
      const app = testApp({
        configuration: getWebhookConfig({
          endpoint: 'https://example.com',
          topics: ['products/create'],
        }),
      })

      await testDeployBundle({
        app,
        partnersApp: {
          id: 'app-id',
          organizationId: 'org-id',
          applicationUrl: 'https://my-app.com',
          redirectUrlWhitelist: ['https://my-app.com/auth'],
          title: 'app-title',
          grantedScopes: [],
        },
      })

      expect(fakedWebhookSubscriptionsMutation).not.toHaveBeenCalled()
      expect(renderSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          headline: 'New version released to users.',
        }),
      )
    })

    test('does not run the webhook subscription task if there is no webhooks config', async () => {
      const app = testApp()

      await testWebhooks(app)

      expect(fakedWebhookSubscriptionsMutation).not.toHaveBeenCalled()
      expect(renderSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          headline: 'New version released to users.',
        }),
      )
    })

    test('runs the webhook subscription task if the declarativeWebhooks beta is enabled', async () => {
      const app = testApp({
        configuration: getWebhookConfig({
          endpoint: 'https://example.com',
          topics: ['products/create'],
        }),
      })

      await testWebhooks(app)

      expect(fakedWebhookSubscriptionsMutation).toHaveBeenCalledWith([
        {
          endpoint: 'https://example.com',
          topic: 'products/create',
        },
      ])
      expect(renderSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          headline: 'New version released to users.',
        }),
      )
    })

    test('normalizes top level subscriptions', async () => {
      const app = testApp({
        configuration: getWebhookConfig({
          endpoint: 'https://example.com',
          topics: ['products/create', 'products/update'],
        }),
      })

      await testWebhooks(app)

      expect(fakedWebhookSubscriptionsMutation).toHaveBeenCalledWith([
        {
          endpoint: 'https://example.com',
          topic: 'products/create',
        },
        {
          endpoint: 'https://example.com',
          topic: 'products/update',
        },
      ])
      expect(renderSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          headline: 'New version released to users.',
        }),
      )
    })

    test('top level http config is overwritten by subscription specific config', async () => {
      const app = testApp({
        configuration: getWebhookConfig({
          endpoint: 'https://example.com',
          topics: ['products/create'],
          subscriptions: [
            {
              endpoint: 'https://example2.com',
              topic: 'products/create',
            },
            {
              endpoint: 'pubsub://my-project-123:my-topic',
              topic: 'products/create',
            },
            {
              topic: 'products/delete',
            },
          ],
        }),
      })

      await testWebhooks(app)

      expect(fakedWebhookSubscriptionsMutation).toHaveBeenCalledWith([
        {
          endpoint: 'https://example.com',
          topic: 'products/create',
        },
        {
          endpoint: 'https://example2.com',
          topic: 'products/create',
        },
        {
          endpoint: 'pubsub://my-project-123:my-topic',
          topic: 'products/create',
        },
        {
          endpoint: 'https://example.com',
          topic: 'products/delete',
        },
      ])
      expect(renderSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          headline: 'New version released to users.',
        }),
      )
    })

    test('top level arn config is overwritten by subscription specific config', async () => {
      const app = testApp({
        configuration: getWebhookConfig({
          endpoint: 'arn:aws:events:us-west-2::event-source/aws.partner/shopify.com/123/my_webhook_path',
          topics: ['products/create'],
          subscriptions: [
            {
              endpoint: 'arn:aws:events:us-west-2::event-source/aws.partner/shopify.com/123/my_new_webhook_path',
              topic: 'products/create',
            },
            {
              endpoint: 'pubsub://my-project-123:my-topic',
              topic: 'products/create',
            },
            {
              topic: 'products/delete',
            },
          ],
        }),
      })

      await testWebhooks(app)

      expect(fakedWebhookSubscriptionsMutation).toHaveBeenCalledWith([
        {
          endpoint: 'arn:aws:events:us-west-2::event-source/aws.partner/shopify.com/123/my_webhook_path',
          topic: 'products/create',
        },
        {
          endpoint: 'arn:aws:events:us-west-2::event-source/aws.partner/shopify.com/123/my_new_webhook_path',
          topic: 'products/create',
        },
        {
          endpoint: 'pubsub://my-project-123:my-topic',
          topic: 'products/create',
        },
        {
          endpoint: 'arn:aws:events:us-west-2::event-source/aws.partner/shopify.com/123/my_webhook_path',
          topic: 'products/delete',
        },
      ])
      expect(renderSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          headline: 'New version released to users.',
        }),
      )
    })

    test('top level pub sub config is overwritten by subscription specific config', async () => {
      const app = testApp({
        configuration: getWebhookConfig({
          endpoint: 'pubsub://my-project-123:my-topic',
          topics: ['products/create'],
          subscriptions: [
            {
              endpoint: 'pubsub://my-project-456:my-new-topic',
              topic: 'products/create',
            },
            {
              endpoint: 'https://example.com',
              topic: 'products/create',
            },
            {
              topic: 'products/delete',
            },
          ],
        }),
      })

      await testWebhooks(app)

      expect(fakedWebhookSubscriptionsMutation).toHaveBeenCalledWith([
        {
          endpoint: 'pubsub://my-project-123:my-topic',
          topic: 'products/create',
        },
        {
          endpoint: 'pubsub://my-project-456:my-new-topic',
          topic: 'products/create',
        },
        {
          endpoint: 'https://example.com',
          topic: 'products/create',
        },
        {
          endpoint: 'pubsub://my-project-123:my-topic',
          topic: 'products/delete',
        },
      ])
      expect(renderSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          headline: 'New version released to users.',
        }),
      )
    })

    test('subscription level path is appended to top level endpoint', async () => {
      const app = testApp({
        configuration: getWebhookConfig({
          endpoint: 'https://example.com',
          topics: ['products/create'],
          subscriptions: [
            {
              topic: 'products/delete',
              path: '/delete',
              include_fields: ['id'],
            },
          ],
        }),
      })

      await testWebhooks(app)

      expect(fakedWebhookSubscriptionsMutation).toHaveBeenCalledWith([
        {
          endpoint: 'https://example.com',
          topic: 'products/create',
        },
        {
          endpoint: 'https://example.com/delete',
          topic: 'products/delete',
          include_fields: ['id'],
        },
      ])
      expect(renderSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          headline: 'New version released to users.',
        }),
      )
    })

    test('subscription level path is appended to inner level endpoint', async () => {
      const app = testApp({
        configuration: getWebhookConfig({
          endpoint: 'https://example.com',
          topics: ['products/create'],
          subscriptions: [
            {
              topic: 'products/delete',
              endpoint: 'https://example2.com',
              path: '/delete',
              include_fields: ['id'],
            },
          ],
        }),
      })

      await testWebhooks(app)

      expect(fakedWebhookSubscriptionsMutation).toHaveBeenCalledWith([
        {
          endpoint: 'https://example.com',
          topic: 'products/create',
        },
        {
          endpoint: 'https://example2.com/delete',
          topic: 'products/delete',
          include_fields: ['id'],
        },
      ])
      expect(renderSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          headline: 'New version released to users.',
        }),
      )
    })
  })
})

interface TestDeployBundleInput {
  app: AppInterface
  partnersApp?: Omit<OrganizationApp, 'apiSecretKeys' | 'apiKey'>
  options?: {
    force?: boolean
    noRelease?: boolean
    message?: string
    version?: string
  }
  released?: boolean
  commitReference?: string
}

async function testDeployBundle({app, partnersApp, options, released = true, commitReference}: TestDeployBundleInput) {
  // Given
  const extensionsPayload: {[key: string]: string} = {}
  for (const extension of app.allExtensions) {
    extensionsPayload[extension.localIdentifier] = extension.localIdentifier
  }
  const identifiers = {app: 'app-id', extensions: extensionsPayload, extensionIds: {}}

  vi.mocked(ensureDeployContext).mockResolvedValue({
    app,
    identifiers,
    partnersApp:
      partnersApp ??
      testOrganizationApp({
        id: 'app-id',
        organizationId: 'org-id',
      }),
    token: 'api-token',
    release: !options?.noRelease,
  })

  vi.mocked(useThemebundling).mockReturnValue(true)
  vi.mocked(uploadFunctionExtensions).mockResolvedValue(identifiers)
  vi.mocked(uploadExtensionsBundle).mockResolvedValue({
    validationErrors: [],
    versionTag,
    message: options?.message,
    ...(!released && {deployError: 'no release error'}),
    location: 'https://partners.shopify.com/0/apps/0/versions/1',
  })
  vi.mocked(updateAppIdentifiers).mockResolvedValue(app)
  vi.mocked(fetchAppExtensionRegistrations).mockResolvedValue({
    app: {extensionRegistrations: [], dashboardManagedExtensionRegistrations: []},
  })

  await deploy({
    app,
    reset: false,
    force: Boolean(options?.force),
    noRelease: Boolean(options?.noRelease),
    message: options?.message,
    version: options?.version,
    ...(commitReference ? {commitReference} : {}),
    commandConfig: {runHook: vi.fn(() => Promise.resolve({successes: []}))} as unknown as Config,
  })
}

async function testWebhooks(app: AppInterface) {
  return testDeployBundle({
    app,
    partnersApp: {
      id: 'app-id',
      organizationId: 'org-id',
      applicationUrl: 'https://my-app.com',
      redirectUrlWhitelist: ['https://my-app.com/auth'],
      title: 'app-title',
      grantedScopes: [],
      betas: {declarativeWebhooks: true},
    },
  })
}
