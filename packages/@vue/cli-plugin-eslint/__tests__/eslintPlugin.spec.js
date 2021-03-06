jest.setTimeout(30000)

const path = require('path')
const { linkBin } = require('@vue/cli-shared-utils')
const create = require('@vue/cli-test-utils/createTestProject')

const runSilently = fn => {
  const log = console.log
  console.log = () => {}
  const res = fn()
  console.log = log
  return res
}

test('should work', async () => {
  const project = await create('eslint', {
    plugins: {
      '@vue/cli-plugin-babel': {},
      '@vue/cli-plugin-eslint': {
        config: 'airbnb',
        lintOn: 'commit'
      }
    }
  })
  const { read, write, run } = project
  // should've applied airbnb autofix
  const main = await read('src/main.js')
  expect(main).toMatch(';')
  // remove semicolons
  const updatedMain = main.replace(/;/g, '')
  await write('src/main.js', updatedMain)
  // lint
  await run('vue-cli-service lint')
  expect(await read('src/main.js')).toMatch(';')

  // lint-on-commit
  await runSilently(() => {
    require('yorkie/src/install')(path.join(project.dir, 'node_modules'))
    // since yorkie isn't actually installed in the test project, we need to
    // symlink it
    return linkBin(
      path.resolve(require.resolve('yorkie/src/install'), '../../'),
      path.join(project.dir, 'node_modules', 'yorkie')
    )
  })
  const hook = await read('.git/hooks/pre-commit')
  expect(hook).toMatch('#yorkie')
  await write('src/main.js', updatedMain)
  // nvm doesn't like PREFIX env
  if (process.platform === 'darwin') {
    delete process.env.PREFIX
  }
  await run('git add -A')
  await run('git commit -m save')
  // should be linted on commit
  expect(await read('src/main.js')).toMatch(';')

  // lint-on-save needs to be tested in a callback
  let done
  const donePromise = new Promise(resolve => {
    done = resolve
  })
  // enable lintOnSave
  await write('vue.config.js', 'module.exports = { lintOnSave: true }')
  // write invalid file
  const app = await read('src/App.vue')
  const updatedApp = app.replace(/;/g, '')
  await write('src/App.vue', updatedApp)

  const server = run('vue-cli-service serve')

  let isFirstMsg = true
  server.stdout.on('data', data => {
    data = data.toString()
    if (data.match(/Failed to compile/)) {
      // should fail on start
      expect(isFirstMsg).toBe(true)
      isFirstMsg = false
      // fix it
      write('src/App.vue', app)
    } else if (data.match(/Compiled successfully/)) {
      // should compile on 2nd update
      expect(isFirstMsg).toBe(false)
      server.stdin.write('close')
      done()
    }
  })

  await donePromise
})
