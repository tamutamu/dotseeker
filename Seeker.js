const axios = require('axios')
const path = require('path')
const fs = require('fs')
const GitHub = require('./GitHub.js')

const API_BASE = 'https://api.github.com'
const LIMIT_URL = `${API_BASE}/rate_limit`

const addTokenHeader = options => {
  if (!options) {
    options = {}
  }

  if (process.env.GITHUB_API_TOKEN) {
    if (!options.headers) {
      options.headers = {}
    }
    options.headers.Authorization = `token ${process.env.GITHUB_API_TOKEN}`
  }
  return options
}

const get = async (url, options) => {
  options = addTokenHeader(options)
  const res = await axios.get(url, options)
  return res
}

const exist = path => {
  try {
    fs.statSync(path)
    return true
  } catch (err) {
    return false
  }
}

const createDirectory = path => {
  if (!exist(path)) {
    fs.mkdirSync(path, { recursive: true })
  }
}

const writeFile = (path, buffer) => {
  if (!exist(path)) {
    fs.writeFileSync(path, buffer)
  }
}

const searchFiles = async (treesUrl, fullName) => {
  const params = {
    recursive: 1,
    type: 'blob',
    page: 1,
    per_page: 100
  }
  const res = await get(treesUrl, { params: params })
  const targetFiles = res.data.tree.filter(
    item =>
      item.type === 'blob' &&
      /^.*\.?(bashrc|bash_profile|zshrc|zsh_profile)/.test(item.path)
  )
  for (let file of targetFiles) {
    try {
      const saveFilePath = `files/${fullName}/${file.path}`
      const dir = path.dirname(saveFilePath)
      createDirectory(dir)
      const blobRes = await get(file.url)
      writeFile(saveFilePath, Buffer.from(blobRes.data.content, 'base64'))
    } catch (err) {
      console.error(err)
    }
  }
  return targetFiles.length
}

const rateLimit = async () => {
  const res = await get(LIMIT_URL, {})
  return res.data
}

module.exports = class Seeker {
  constructor(options = {}) {
    this.q = options.q === undefined ? 'topic:dotfiles' : options.q
    this.sort = options.sort === undefined ? 'stars' : options.sort
    this.page = options.page === undefined ? 1 : options.page
    this.perPage = options.perPage === undefined ? 10 : options.perPage
  }

  async seek() {
    console.info('search dotfiles topic repositories...')
    const gh = new GitHub(process.env.GITHUB_API_TOKEN)
    const data = await gh.search({
      q: this.q,
      sort: this.sort,
      page: this.page,
      per_page: this.perPage
    })

    console.info(`repositories: ${data.total_count}`)
    console.info(
      `target: top ${this.perPage * (this.page - 1) + 1} to ${this.perPage *
        this.page}`
    )
    let count = 0
    for (let item of data.items) {
      const treesUrl = item.trees_url.replace(
        '{/sha}',
        `/${item.default_branch}`
      )
      count += await searchFiles(treesUrl, item.full_name)
    }
    console.info(`saved files: ${count}`)
    console.info('limit rate info:')
    console.info(await rateLimit())
  }
}
