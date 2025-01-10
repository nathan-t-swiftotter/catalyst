/* eslint-disable no-underscore-dangle */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { WP_REST_API_Post, WP_REST_API_Posts, WP_REST_API_Tags } from 'wp-types';
import {FragmentOf} from "~/client/graphql";
import {BlogPostCardFragment} from "~/components/blog-post-card/fragment";

interface PostsListParams {
  tagId?: string;
  page?: number;
  perPage?: number;
  offset?: number;
  order?: 'asc' | 'desc';
  orderby?: 'date' | 'relevance' | 'id' | 'include' | 'title' | 'slug';
  locale?: string;
}

interface SinglePostParams {
  blogId: string;
  locale?: string;
}

interface SinglePageParams {
  path: string;
  locale?: string;
}

const SITE_URL = process.env.WORDPRESS_URL || '';

export async function getWordPressPosts(searchParams: PostsListParams) {
  const {
    tagId,
    page = 1,
    perPage = 9,
    offset,
    order = 'desc',
    orderby = 'date',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- locale can be added to the url if the store has WPML Translation Management enabled. Otherwise, it is not used.
    locale = 'en',
  } = searchParams;

  let url = `${SITE_URL}/wp-json/wp/v2/posts?_embed&page=${page}&per_page=${perPage}&order=${order}&orderby=${orderby}`;

  let tagName = '';

  if (tagId) {
    // The tagId param is a string, so the url is human readable, while the WP API filter uses
    // an integer ID to filter posts on tags. So we will reach out to the WP API to get the tag integer ID.
    const tagsApiUrl = `${SITE_URL}/wp-json/wp/v2/tags?slug=${tagId}`;
    const tagResponse = await fetch(tagsApiUrl);

    if (!tagResponse.ok) {
      throw new Error(`WordPress API fetch error: ${tagsApiUrl} (code: ${tagResponse.status})`);
    }

    const tags = (await tagResponse.json()) as WP_REST_API_Tags;

    if (!tags[0]) {
      return null;
    }

    tagName = tags[0].name;

    url += `&tags=${tags[0].id}`;
  }

  if (offset) {
    url += `&offset=${offset}`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`WordPress API fetch error: ${url} (code: ${response.status})`);
  }

  const posts = (await response.json()) as WP_REST_API_Posts;
  const totalPosts = parseInt(response.headers.get('X-WP-Total')?.toString() || '0', 10);
  const totalPages = parseInt(response.headers.get('X-WP-TotalPages')?.toString() || '0', 10);

  const pageTitle = `Blog${tagName ? `: ${tagName}` : ''}`;

  return transformDataToBlogPosts(posts, pageTitle, totalPosts, totalPages, page, perPage);
}

export async function getWordPressPost(postParams: SinglePostParams) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- locale can be added to the url if the store has WPML Translation Management enabled. Otherwise, it is not used.
  const { blogId, locale = 'en' } = postParams;

  const url = `${SITE_URL}/wp-json/wp/v2/posts?slug=${blogId}&_embed`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API fetch error: ${response.status}`);
  }

  const posts = (await response.json()) as WP_REST_API_Posts;

  if (!posts[0]) {
    return null;
  }

  return transformDataToBlogPost(posts[0]);
}

export async function getWordPressPage(params: SinglePageParams) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- locale can be added to the url if the store has WPML Translation Management enabled. Otherwise, it is not used.
  const { path, locale = 'en' } = params;
  const url = `${SITE_URL}/wp-json/wp/v2/pages?slug=${path.split('/').pop()}&_embed`;

  const response = await fetch(url);

  if (response.status !== 200) {
    throw new Error(`API fetch error: ${response.status}`);
  }

  const pages = (await response.json()) as WP_REST_API_Posts;

  if (pages.length === 0) {
    return null;
  }

  return pages[0];
}

function transformDataToBlogPosts(
  posts: WP_REST_API_Posts,
  pageTitle: string,
  totalPosts: number,
  totalPages: number,
  currentPage: number,
  perPage: number,
) {
  return {
    name: pageTitle,
    description: '',
    posts: {
      pageInfo: {
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
        startCursor: currentPage.toString(),
        endCursor: (currentPage + 1).toString(),
        currentPage,
        totalPages,
        totalPosts,
        perPage,
      },
      items: posts.map((post: WP_REST_API_Post) => ({
        author: post._embedded?.author[0]?.name || '',
        entityId: post.slug,
        name: post.title.rendered
          .replaceAll('&#8217;', "'")
          .replaceAll('&#8220;', '"')
          .replaceAll('&#8221;', '"'),
        plainTextSummary: post.excerpt.rendered
          .replace(/(<([^>]+)>)/gi, '')
          .replaceAll('&#8217;', "'")
          .replace('&#8230;', '...')
          .replace('Continue Reading', ''),
        publishedDate: { utc: post.date_gmt },
        thumbnailImage: post._embedded?.['wp:featuredmedia']?.[0]
          ? {
              altText: post._embedded['wp:featuredmedia'][0].alt_text || '',
              url: post._embedded['wp:featuredmedia'][0].source_url,
            }
          : null,
      })),
    },
    isVisibleInNavigation: true,
  };
}

function transformDataToBlogPost(post: WP_REST_API_Post) {
  return {
    author: post._embedded?.author[0]?.name || '',
    htmlBody: post.content.rendered,
    content: post.content.rendered,
    id: post.slug,
    name: post.title.rendered,
    publishedDate: { utc: post.date_gmt },
    tags:
      post._embedded?.['wp:term']?.[1]?.map((tag: { name: string; slug: string }) => ({
        name: tag.name,
        href: `/blog/tag/${tag.slug}`,
      })) || [],
    thumbnailImage: post._embedded?.['wp:featuredmedia']?.[0]
      ? {
          altText: post._embedded['wp:featuredmedia'][0].alt_text || '',
          url: post._embedded['wp:featuredmedia'][0].source_url,
        }
      : null,
    seo: {
      metaKeywords:
        post._embedded?.['wp:term']?.[1]
          ?.map((tag: { name: string; slug: string }) => tag.name)
          .join(',') || '',
      metaDescription: post.excerpt.rendered.replace(/(<([^>]+)>)/gi, ''),
      pageTitle: post.title.rendered,
    },
    isVisibleInNavigation: true,
    vanityUrl: post.link,
  };
}
