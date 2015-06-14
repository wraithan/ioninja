var Metalsmith = require('metalsmith')

var branch = require('metalsmith-branch')
var collections = require('metalsmith-collections')
var excerpts = require('metalsmith-excerpts')
var markdown = require('metalsmith-markdown')
var permalinks = require('metalsmith-permalinks')
var templates = require('metalsmith-templates')
var metallic = require('metalsmith-metallic');

Metalsmith(__dirname)
    .metadata({
        site: {
            title: 'Iron Oxide Ninja',
            url: 'http://iron-oxide.ninja'
        }
    })
    .source('./src')
    .destination('./build')
    .use(markdown())
    .use(metallic())
    .use(excerpts())
    .use(collections({
        posts: {
            pattern: 'posts/**.html',
            sortBy: 'publishDate',
            reverse: true
        },
        projects: {
            pattern: 'src/projects/**.md',
            sortBy: 'title'
        }
    }))
    .use(branch('posts/**.html')
         .use(permalinks({
             pattern: 'blog/:publishDate/:title',
             date: 'YYYY/MMM',
             relative: false
         }))
         .use(templates({
             engine: 'swig',
             directory: 'templates',
             default: 'post.html'
         }))
        )

    .build(function buildComplete (err) {
        if (err) {
            console.error(err)
            return
        }
        console.log('Site build complete!')
    })
