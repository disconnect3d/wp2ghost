/// If set on false, the post will not be migrated to ghost.json / redirects
/// If set to true, the post will be migrated and its slug will be generated automagically
const GENERATE_SLUG_IF_NOT_PRESENT = false;

const uniquePrefix = "THIS-UNIQUE-TEXT-WILL-BE-REPLACED-X";

// title is passed for easier debugging :P
var convertHtmlToMarkdown = function(html, title) {
  // We use node-europa/europa to convert HTML to Markdown
  // See https://github.com/NotNinja/europa
  const Europa = require('node-europa');
  const europa = new Europa({inline: true});

  // 1. Remove captions from images/other media - there are no captions in Markdown :'(
  html = html.replace(/\[caption.+\](.+)\[\/caption\]/g, '$1');

  // 2. Convert code listings -- this is done in two steps - here we just replace it with placeholders
  // that are later replaced with real markdown code listings, after the html is converted to markdown
  // this is because the node-europa can't replace [code] boxes from WordPress by itself...
  //
  // Example:
  //    [code language="javascript" autolinks="false" title="Some title here!"]
  //    some code sanitized with xml stuff
  //    [/code]
  //
  // NOTE: Sometimes the `language` attribute is written as `lang`
  //
  // This is changed to:
  //     Some title here!
  //     ```javascript
  //     some c onde sanitized with xml stuff
  //     ```
  var codeReplacements = {};
  var codeReplacementsCount = 0;

  function replaceWithPlaceholders(fullmatch, codetag, undef, langmatch, languagematch, lang, titlematch, title, code) {
    const replacePlaceholder = uniquePrefix + codeReplacementsCount;

    const replaceWith = treatCodeListing(fullmatch, codetag, undef, langmatch, languagematch, lang, titlematch, title, code);
    codeReplacements[codeReplacementsCount] = replaceWith;

    codeReplacementsCount += 1;

    return replacePlaceholder;
  }

  html = html.replace(/\[((source)?code)([ ]lang(uage)?="([a-zA-Z]+)")?[ ]?[^ \]]*([ ]title="([a-zA-Z0-9_ !-]+)")?[^\]]*\]\n*([\s\S]*?)\n*\[\/\1\]/g, replaceWithPlaceholders);

  // 3. Convert [audio] and [video] boxes
  // NOTE: This might require some polishing, wasn't super well tested
  html = html.replace(/\[audio\s(.+)\]/g, reformatAudioShortcode);
  html = html.replace(/\[video\s(.+)\]/g, reformatVideoShortcode);

  // 4. Convert newlines, so we keep paragraphs between html and md
  // (yeah, we add a newline via <br> but it helps with e.g. bullet listings)
  html = html.replace(/\r\n/g, "\n<br>");
  html = html.replace(/\n/g, "\n<br>");

  // 5. Convert html to markdown
  // Note that this does not convert e.g. [source] boxes, so we did convert them earlier
  var md = europa.convert(html);

  // 6. Bring back code listings
  for(var i=0; i<codeReplacementsCount; ++i) {
    const replacePlaceholder = uniquePrefix + i;
    md = md.replace(replacePlaceholder, codeReplacements[i]);
  }

  // 7. Some sanity checks / assertions (?)
  const check = function(txt) {
    if (md.includes(txt)) {
      console.log("[INFO] Detected '" + txt + "' at post " + title);
    }
  };
  check("[caption");
  check("[audio");
  check("[video");
  check("[google");

  check("[code ");
  check("[source ");

  return md;
}

/// This function takes code listing and generates:
///  <title>
///  ```language
///  <unsanitized code inside>
///  ```
///  or: `<unsanitized code inside>`
var treatCodeListing = function(fullmatch, codetag, undef, langmatch, languagematch, lang, titlematch, title, code) {
  // strips <pre><code> </pre></code> and unsanitizes text
  res = code.replace(/&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .replace(/&amp;/g, '&');

  if (typeof lang === 'undefined')
    lang = '';

  if (typeof title === 'undefined')
    title = '';

  // title should be used only for multiline
  if (res.includes("\n") || title !== '') {
    return title + '\n```' + lang + '\n' + res + '\n```\n';
  }
  else if (lang !== '')
    return '```' + lang + '\n' + res + '\n```'
  else
    return '`' + res + '`';
}

// Redirects - see https://ghost.org/tutorials/implementing-redirects/
// This function is used to create a single redirect object for Ghost's redirects.json file that cotains a list of JSONs like:
// { "from": "/slug-url", "to": "/{year}/{month}/{day}/{slug}", "permanent": true}
var createRedirect = function(slug, pubDate) {
  var addLeadingZero = function(num) {
    var s = "0" + num;
    return s.substr(s.length - 2);
  };

  var year = pubDate.getFullYear();
  var month = addLeadingZero(pubDate.getMonth() + 1);
  var day = addLeadingZero(pubDate.getDate());

  return {
    "from": `^/${slug}`,
    "to": `/${year}/${month}/${day}/${slug}`,
    "permanent": true
  };
}

var reformatAudioShortcode = function(html){ 
  var sources = html.match(/["'](.+?)["']/g).map(function(source) { return '<source src=' + source + '>'}).join('');
  return '<audio controls>' + sources + '</audio>';
}

var reformatVideoShortcode = function(html) {
  var sources = html.match(/"(.+?)"/g).map(function(source) { 
    return '<source src='+ source +' type="video/' + source.match(/['"](.*)\.([^.]*)['"]$/)[2] + '">'
  }).join('');
  return '<video controls>' + sources + '</video>'
}

// From ghost/core/server/models/base.js
var slugify = function(title) {
  // Remove URL reserved chars: `:/?#[]@!$&'()*+,;=` as well as `\%<>|^~£"`
  slug = title.replace(/[:\/\?#\[\]@!$&'()*+,;=\\%<>\|\^~£"]/g, '')
              .replace(/(\s|\.)/g, '-')
              .replace(/-+/g, '-')
              .toLowerCase();

  slug = slug.charAt(slug.length - 1) === '-' ? slug.substr(0, slug.length - 1) : slug;
  slug = /^(ghost|ghost\-admin|admin|wp\-admin|wp\-login|dashboard|logout|login|signin|signup|signout|register|archive|archives|category|categories|tag|tags|page|pages|post|posts|user|users|rss)$/g
         .test(slug) ? slug + '-post' : slug;
  return slug;
}

exports.fromStream = function(stream) {
  var Promise = require('promise');
  var XmlStream = require('xml-stream');

  return new Promise(function(resolve, reject) {
    stream.on('error', function(err) {
      reject(err);
      return;
    });

    var xml = new XmlStream(stream);

    var statusmap = {
      "publish": "published",
      "draft": "draft"
    };

    var exportDate = null;
    var users = [];
    var posts = [];
    var tags  = [];
    var posts_tags = [];
    var user2author_id = {};
    var termname2tag = {};
    var featuredImages = {};

    var redirects = []; // see createRedirects docstring

    xml.on('endElement: pubDate', function(pd) {
      if (exportDate !== null) return;
      exportDate = new Date(pd.$text);
    });

    // Parsing WordPress categories into Ghost tags
    // There are at least 3 ways WP saves categories:
    // <wp:category> elements
    // <wp:tag> elemenets
    // <category> elements, e.g. <category domain="category" nicename="compilers"><![CDATA[Compilers]]></category>
    //
    xml.on('endElement: wp:category', function(category) {
      var tag = {
        "id": parseInt(category['wp:term_id'], 10),
        "slug": category['wp:category_nicename'],
        "name": category['wp:cat_name'],
        "description": category['wp:category_description']
      };
      tags.push(tag);
      termname2tag[tag.slug] = tag.id;
    });

    xml.on('endElement: wp:tag', function(category) {
      var tag = {
        "id": parseInt(category['wp:term_id'], 10),
        "slug": category['wp:tag_slug'],
        "name": category['wp:tag_name'],
        "description": ""
      };

      if (tag.slug in termname2tag) return;

      tags.push(tag);
      termname2tag[tag.slug] = tag.id;
    });

    var incremental_tag_id = 1;
    xml.on('endElement: category', function(category) {
      // Example: category = { '$': { domain: 'category', nicename: 'mitigations' }, '$text': 'Mitigations' }
      var tag = {
        "id": "tag-" + incremental_tag_id,
        "slug": category['$']['nicename'],
        "name": category['$text'],
        "description": ""
      };
      incremental_tag_id += 1;
      if (tag.slug in termname2tag) return;
      tags.push(tag);
      termname2tag[tag.slug] = tag.id;
    });

    xml.on('endElement: wp:author', function(author) {
      var user = {
        'name': author['wp:author_display_name'],
        'slug': author['wp:author_login'],
        'email': author['wp:author_email']
      };

      users.push(user);
      user_id = users.length;
      user["id"] = user_id;
      user2author_id[user.slug] = user_id;
    });

    var slugs = {};
    xml.collect('category');
    xml.preserve('content:encoded', true);
    xml.on('endElement: item', function(item) {
      var postType = item['wp:post_type'];

      if (['post', 'page', 'attachment'].indexOf(postType) == -1) return;

      if (postType == 'attachment') {
        var postParentId = parseInt(item['wp:post_parent']);

        if (postParentId) {
          var imageURL = item['guid'].$text;
          featuredImages[postParentId] = imageURL;
          return;
        } else {
          return;
        }
      }

      // if post_date_gmt is undefined or 0000 then we check post_date in hope of finding a better date.
      // if post_date is undefined we dont know the time an assume 0000
      var date = item['wp:post_date_gmt'];
      if (date == undefined || date == "0000-00-00 00:00:00") {
          date = item['wp:post_date'];
          if (date == undefined) {
            date='1970-01-01 00:00:00'
          }
      }

      date = date.match(/(\d{4})-(\d+)-(\d+) (\d+):(\d+):(\d+)/);
      date = date.map(function(e) { return parseInt(e, 10); });
      var d = new Date(Date.UTC(date[1], date[2]-1, date[3], date[4], date[5], date[6], 0));

      var pubDate = d;
      if (item['pubDate'].match("-0001") === null) {
        pubDate = new Date(item['pubDate']);
      }

      const debugOnTitle = 0;
      if (debugOnTitle && !item.title.includes(debugOnTitle))
        return;

      //console.log(Object.keys(item));
      //console.log(item['dc:creator']);
      //console.log(item['excerpt:encoded']); // only few posts have it
      //console.log("BEFORE");
      const html = item['content:encoded'].$children.join('');
      const md = convertHtmlToMarkdown(html, item.title);
      //console.log("AFTER");

      if (debugOnTitle) {
        const fs = require('fs');
        fs.writeFileSync('./saved.html', html);
        fs.writeFileSync('./saved.md', md);
      }

      var post = {
        "id": parseInt(item['wp:post_id'], 10),
        "title": item.title,
        "slug": item['wp:post_name'],
        "markdown": md,
        "html": md,
        "image": null,
        "featured": item['wp:is_sticky'] === "1",
        "page": item['wp:post_type'] == "page" ? 1 : 0,
        "status": item['wp:status'] in statusmap ? statusmap[item['wp:status']] : "draft",
        "language": "en_US",
        "meta_title": null,
        "meta_description": null,
        "author_id": user2author_id[item['dc:creator']],
        "created_at": d.getTime(),
        "created_by": 1,
        "updated_at": d.getTime(),
        "updated_by": 1,
        "published_at": pubDate.getTime(),
        "published_by": 1
      };

      if (!post.title) {
        post.title = 'Untitled post';
      }

      if (!post.slug) {
        if (!GENERATE_SLUG_IF_NOT_PRESENT) {
          console.log("!> post " + item['link'] + " ignored as it has no slug");
          return;
        }
        post.slug = slugify(post.title);
        console.log("!> post " + item['link'] + " has no slug; generated one: " + post.slug);
      }

      redirects.push(createRedirect(post.slug, pubDate));

      // This can happen because WP allows posts to share slugs...
      if (post.slug in slugs) {
        var slug = slugify(post.title);
        if (slug === "" || slug in slugs) {
          var n = 2;
          post.slug = post.slug.replace(/-\d*$/, '');
          while (post.slug + "-" + n in slugs) { n++; }
          slug = post.slug + "-" + n;
        }
        console.error("!> slug '" + post.slug + "' was repeated; the post '" + post.title + "' now has slug '" + slug + "'");
        post.slug = slug;
      }
      slugs[post.slug] = post;

      if (typeof item.category !== "undefined") {
        for (var i = 0; i < item.category.length; i++) {
          if (!item.category[i].$) continue;

          posts_tags.push({
            "tag_id": termname2tag[item.category[i].$.nicename],
            "post_id": post.id
          });
        }
      }

      posts.push(post);
    });

    xml.on('end', function() {
      function addFeaturedImage(post) {
        var featuredPostsIds = Object.keys(featuredImages).map(function(key) {
          return parseInt(key);
        });

        var hasFeaturedImage = featuredPostsIds.indexOf(post.id);

        if (hasFeaturedImage != -1) {
          post.image = featuredImages[post.id];
        }

        return post;
      };

      posts = posts.map(addFeaturedImage);

      var ghostJson = {
        "meta":{
            "exported_on": exportDate.getTime() * 1000,
            "version": "000"
        },
        "data":{
            "posts": posts,
            "tags": tags,
            "posts_tags": posts_tags,
            "users": users
        }
      };
      resolve({'ghost.json': ghostJson, 'redirects.json': redirects});
    });
  });
};



exports.fromFile = function(file) {
  const fs = require('fs');

  return exports.fromStream(fs.createReadStream(file));
};
