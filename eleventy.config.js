import { IdAttributePlugin, InputPathToUrlTransformPlugin, HtmlBasePlugin } from "@11ty/eleventy";
import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import pluginSyntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import pluginNavigation from "@11ty/eleventy-navigation";
import yaml from "js-yaml";
import pluginFilters from "./_config/filters.js";
import markdownIt from "markdown-it";
import fontAwesomePlugin from "@11ty/font-awesome";
import embedEverything from "eleventy-plugin-embed-everything";
import htmlmin from "html-minifier-terser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { PurgeCSS } from 'purgecss';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/** @param {import("@11ty/eleventy").UserConfig} eleventyConfig */
export default async function(eleventyConfig) {
	// Plugins
	eleventyConfig.addPlugin(fontAwesomePlugin);
	
	eleventyConfig.addPreprocessor("drafts", "*", (data, content) => {
		if(data.draft && process.env.ELEVENTY_RUN_MODE === "build") {
			return false;
		}
	});

	eleventyConfig
		.addPassthroughCopy({
			"./public/": "/"
		})
		.addPassthroughCopy("./content/feed/pretty-atom-feed.xsl");
	eleventyConfig.addDataExtension("yaml", (contents) => yaml.load(contents));
	eleventyConfig.addWatchTarget("css/**/*.css");
	eleventyConfig.addPlugin(embedEverything);
	eleventyConfig.addWatchTarget("content/**/*.{svg,webp,png,jpg,jpeg,gif}");
	eleventyConfig.addBundle("css", {
		toFileDirectory: "dist",
		// Don't extract inline CSS - only bundle styles with webc:bundle attribute
		bundleHtmlContentFromSelector: "style[webc\\:bundle]",
	});
	eleventyConfig.addBundle("js", {
		toFileDirectory: "dist",
		// Only bundle scripts explicitly marked; keep inline scripts like JSON-LD in the page
		bundleHtmlContentFromSelector: "script[webc\\:bundle]",
	});
	eleventyConfig.addPlugin(pluginSyntaxHighlight, {
		preAttributes: { tabindex: 0 }
	});
	eleventyConfig.addPlugin(pluginNavigation);
	eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`);
	eleventyConfig.addPlugin(HtmlBasePlugin);
	eleventyConfig.addPlugin(InputPathToUrlTransformPlugin);

	eleventyConfig.addPlugin(feedPlugin, {
		type: "atom",
		outputPath: "/feed/feed.xml",
		stylesheet: "pretty-atom-feed.xsl",
		templateData: {
			eleventyNavigation: {
				key: "Feed",
				order: 4
			}
		},
		collection: {
			name: "all",
			limit: 10,
		},
		metadata: {
			language: "en",
			title: "Desecrating the Sacred",
			subtitle: "Desecrating the Sacred is the result of a decades-long meditation that raises a profound question with planetary implications: What happens when the Sacred Free Existence of the Original Native Nations and Peoples of Turtle Island (&ldquo;North America&rdquo;) which honors All of Creation is invaded and thereby desecrated by an invading People who have traversed a vast ocean, an invading People who claim they are carrying a Sacred Right of Domination given to them by their &ldquo;God&rdquo;?",
			base: "https://desecratingthesacred.com/",
			author: {
				name: "desecratingthesacred"
			}
		}
	});

	let markdownItOptions = {
    html: true,
    breaks: true,
    linkify: true
  };
	let markdownLib = markdownIt(markdownItOptions);
	eleventyConfig.addFilter('markdownify', (markdownString) => {
		return markdownLib.render(markdownString);
	});
	eleventyConfig.addPlugin(pluginFilters);

	eleventyConfig.addPlugin(IdAttributePlugin, {
	});

	eleventyConfig.addShortcode("currentBuildDate", () => {
		return (new Date()).toISOString();
	});

		// Shortcode to inline CSS - just reads and inlines, purging happens in transform
	eleventyConfig.addShortcode("inlineCSS", function(filepath) {
		try {
			// Resolve path relative to project root
			const absolutePath = path.resolve(__dirname, filepath);
			const cssContent = fs.readFileSync(absolutePath, "utf8");
			console.log(`[inlineCSS] Returning ${cssContent.length} bytes for ${filepath}`);
			const result = `<style data-inline-css="${filepath}">${cssContent}</style>`;
			console.log(`[inlineCSS] Result length: ${result.length}`);
			return result;
		} catch (error) {
			console.error(`[inlineCSS] Error reading CSS file ${filepath}:`, error.message);
			return "";
		}
	});

	// PurgeCSS transform - runs after HTML is generated
	eleventyConfig.addTransform("purgecss", async function(content) {
		if (this.page.outputPath && this.page.outputPath.endsWith(".html") && process.env.ELEVENTY_RUN_MODE === "build") {
			try {
				// Extract inline CSS from style tags
				const styleRegex = /<style>([\s\S]*?)<\/style>/g;
				let match;
				let processedContent = content;
				let replacements = [];

				// Build an HTML version without any inline CSS so PurgeCSS doesn't see selectors from CSS itself
				const htmlWithoutCss = content.replace(styleRegex, "");
				
				while ((match = styleRegex.exec(content)) !== null) {
					const originalCSS = match[1];
					if (originalCSS.length < 1000) continue; // Skip small style blocks
					
					console.log(`[purgecss] ${this.page.outputPath}: Purging ${originalCSS.length} bytes of CSS`);
					
					// Purge unused CSS
					const purgeCSSResults = await new PurgeCSS().purge({
						content: [{
							raw: htmlWithoutCss,
							extension: 'html'
						}],
						css: [{ raw: originalCSS }],
						defaultExtractor: content => (content.match(/[A-Za-z0-9_-]+/g) || []),
						safelist: {
							standard: ['active', 'show', 'collapse', 'collapsing', 'fade', 'modal-backdrop', 'visually-hidden'],
							deep: [/^navbar/, /^dropdown/, /^modal/, /^carousel/, /^btn/, /^alert/, /^fa-/, /^icon-/, /^svg-/, /^col-/, /^row$/, /^gx-/],
							greedy: [/data-bs/]
						}
					});
					
					const purgedCSS = purgeCSSResults[0]?.css || originalCSS;
					console.log(`[purgecss] ${this.page.outputPath}: Purged to ${purgedCSS.length} bytes`);
					replacements.push({
						original: match[0],
						purged: `<style>${purgedCSS}</style>`
					});
				}
				
				// Apply all replacements
				for (const {original, purged} of replacements) {
					processedContent = processedContent.replace(original, purged);
				}
				
				return processedContent;
			} catch (error) {
				console.error(`[purgecss] Error purging CSS:`, error.message);
				return content;
			}
		}
		return content;
	});

	// HTML minification transform
	eleventyConfig.addTransform("htmlmin", function(content) {
		if (this.page.outputPath && this.page.outputPath.endsWith(".html")) {
			try {
				const minified = htmlmin.minify(content, {
					useShortDoctype: true,
					removeComments: true,
					collapseWhitespace: true,
					minifyCSS: true,
					minifyJS: true
				});
				return minified;
			} catch (error) {
				console.error(`[htmlmin] Error minifying ${this.page.outputPath}:`, error.message);
				return content;
			}
		}
		return content;
	});
};

export const config = {
	templateFormats: [
		"md",
		"njk",
		"html",
		"liquid",
		"11ty.js",
	],
	markdownTemplateEngine: "njk",
	htmlTemplateEngine: "njk",
	dir: {
		input: "content",          // default: "."
		includes: "../_includes",  // default: "_includes" (`input` relative)
		data: "../_data",          // default: "_data" (`input` relative)
		output: "_site"
	},

};
