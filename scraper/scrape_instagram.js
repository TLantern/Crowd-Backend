// scrape_instagram.js
// Funnel 1: Instagram org accounts -> Firestore
// 1. Load cookies for a burner IG session
// 2. Visit each handle
// 3. Scrape recent posts (caption, timestamp)
// 4. Parse caption into structured event
// 5. Write raw payload + normalized event to Firestore

import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { rsleep } from "./utils.js";
import { parseCaption } from "./parseCaption.js";
// import {
//   db,
//   writeInstagramRaw,
//   writeNormalizedEvent
// } from "./firestore.js";

// CONFIG
const TARGET_HANDLES = [
  "rich.creatives",
  "tenoftenent"
];
const MAX_POSTS_PER_HANDLE = 5;
const IG_BASE = "https://www.instagram.com/";
const LOGIN_CREDENTIALS = {
  username: "essap_ai",
  password: "StackBread2@"
};

async function loadCookies(context) {
  if (!existsSync("cookies.json")) return;
  const cookies = JSON.parse(readFileSync("cookies.json", "utf8"));
  await context.addCookies(cookies);
}

async function saveCookies(context) {
  const cookies = await context.cookies();
  writeFileSync("cookies.json", JSON.stringify(cookies, null, 2), "utf8");
}

async function loginToInstagram(page) {
  console.log("Logging into Instagram...");
  
  // Go to login page
  await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "networkidle" });
  console.log("Current URL after login page:", page.url());
  await rsleep(2000, 3000);

  // Fill username
  await page.fill('input[name="username"]', LOGIN_CREDENTIALS.username);
  console.log("Filled username, current URL:", page.url());
  await rsleep(500, 1000);

  // Fill password
  await page.fill('input[name="password"]', LOGIN_CREDENTIALS.password);
  console.log("Filled password, current URL:", page.url());
  await rsleep(500, 1000);

  // Click login button
  await page.click('button[type="submit"]');
  console.log("Clicked login button, current URL:", page.url());
  await rsleep(3000, 5000);

  // Check if login was successful by looking for the home page or any error messages
  const currentUrl = page.url();
  console.log("Final URL after login attempt:", currentUrl);
  
  if (currentUrl.includes("/accounts/login/")) {
    // Check for error messages
    const errorElement = await page.$('[role="alert"]');
    if (errorElement) {
      const errorText = await errorElement.textContent();
      throw new Error(`Login failed: ${errorText}`);
    }
    throw new Error("Login failed: Still on login page");
  }

  console.log("Login successful!");
  await rsleep(2000, 3000);
}

// Scrape one handle
async function scrapeHandle(page, handle) {
  const profileUrl = `${IG_BASE}${handle}/`;
  console.log(`Navigating to ${profileUrl}`);
  console.log("Current URL before navigation:", page.url());
  
  try {
    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    console.log("Current URL after navigation:", page.url());
    await rsleep(3000, 5000);
  } catch (error) {
    console.log(`Failed to load profile ${handle}: ${error.message}`);
    console.log("Current URL after error:", page.url());
    return [];
  }

  // Check if we're on the right page
  const currentUrl = page.url();
  console.log("URL after loading profile:", currentUrl);
  
  if (!currentUrl.includes(handle)) {
    console.log(`Warning: Not on expected profile page. Current URL: ${currentUrl}`);
  }

  // Click on the left side of the page first to dismiss any overlays
  console.log("Clicking on left side of page to dismiss overlays...");
  await page.click('body', { position: { x: 100, y: 400 } });
  await rsleep(1000, 2000);
  console.log("URL after clicking left side:", page.url());

  // scroll to load posts
  console.log("Scrolling to load posts...");
  await page.mouse.wheel(0, 800);
  await rsleep(1500, 2500);
  console.log("URL after scrolling:", page.url());

  // Try multiple scrolls to load more posts
  console.log("Scrolling more to load additional posts...");
  await page.mouse.wheel(0, 1200);
  await rsleep(2000, 3000);
  console.log("URL after additional scrolling:", page.url());

  // get links to posts: look for /p/<shortcode>/
  console.log("Looking for post links...");
  const postLinks = await page.$$eval("article a[href*='/p/']", (as) =>
    as.slice(0, 10).map((a) => a.getAttribute("href"))
  );
  console.log(`Found ${postLinks.length} post links:`, postLinks);

  // If no links found, try alternative selectors
  if (postLinks.length === 0) {
    console.log("Trying alternative selectors...");
    const altLinks = await page.$$eval("a[href*='/p/']", (as) =>
      as.slice(0, 10).map((a) => a.getAttribute("href"))
    );
    console.log(`Found ${altLinks.length} links with alternative selector:`, altLinks);
    
    // Use alternative links if found
    if (altLinks.length > 0) {
      postLinks.push(...altLinks);
    }
  }

  const results = [];

  for (const href of postLinks.slice(0, MAX_POSTS_PER_HANDLE)) {
    const postUrl = new URL(href, "https://www.instagram.com").toString();
    console.log(`Scraping post: ${postUrl}`);
    console.log("Current URL before post navigation:", page.url());

    try {
      await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
      console.log("Current URL after post navigation:", page.url());
      await rsleep(2000, 4000);
    } catch (error) {
      console.log(`Failed to load post ${postUrl}: ${error.message}`);
      console.log("Current URL after post error:", page.url());
      continue;
    }

    // get shortcode as postId
    const postId = await page.evaluate(() => {
      return (
        window.location.pathname.split("/").filter(Boolean)[1] || null
      );
    });

    // timestamp is usually in <time datetime="...">
    const timestampISO = await page.$eval("time", (el) =>
      el.getAttribute("datetime")
    );

    // try caption
    let rawCaption = "";
    try {
      rawCaption = await page.$eval(
        "h1, div[role='button'] > span",
        (el) => el.innerText
      );
    } catch {
      rawCaption = "";
    }
    if (!rawCaption || rawCaption.length < 3) {
      const maybe = await page.$$eval("article span", (spans) =>
        spans.map((s) => s.innerText).filter(Boolean)
      );
      rawCaption = maybe[0] || "";
    }

    const parsed = parseCaption(rawCaption, handle, timestampISO);

    const normalized = {
      title: parsed.title || rawCaption.split(/\s+/).slice(0, 5).join(" "),
      locationName: parsed.locationName || null,
      startTimeLocal: parsed.startTimeLocal || null,
      endTimeLocal: null,
      sourceType: "instagram",
      sourceOrg: handle,
      sourceUrl: postUrl
    };

    // Save to results array instead of Firestore (for debugging)
    const rawData = {
      orgHandle: handle,
      postUrl,
      rawCaption,
      timestampISO,
      parsed
    };

    results.push({
      postId,
      rawData,
      normalized: {
        ...normalized,
        confidence: parsed.confidence
      }
    });

    await rsleep(3000, 6000);
  }

  return results;
}

(async () => {
  const browser = await chromium.launch({
    headless: false // set false first run to log in manually
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "en-US",
    timezoneId: "America/Chicago",
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    colorScheme: "light"
  });

  await loadCookies(context);

  const page = await context.newPage();

  // Try to login automatically
  try {
    await loginToInstagram(page);
  } catch (error) {
    console.log("Auto-login failed, trying with saved cookies...");
    // If auto-login fails, try with saved cookies
    const currentUrl = page.url();
    if (currentUrl.includes("/accounts/login/")) {
      console.log("Please log in manually in the browser window that opened...");
      console.log("Press Enter in this terminal after you've successfully logged in...");
      
      // Wait for user to press Enter
      await new Promise(resolve => {
        process.stdin.once('data', () => {
          resolve();
        });
      });
      
      // Check if login was successful
      const newUrl = page.url();
      if (newUrl.includes("/accounts/login/")) {
        console.log("Login still not successful. Please try again.");
        await browser.close();
        return;
      }
    }
  }

  // Check if we're logged in by going to home page
  console.log("Checking login status...");
  await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded" });
  console.log("Current URL after home page:", page.url());
  
  // Check for login indicators
  const isLoggedIn = await page.evaluate(() => {
    // Look for elements that indicate we're logged in
    return document.querySelector('a[href="/direct/inbox/"]') !== null || 
           document.querySelector('a[href="/explore/"]') !== null ||
           document.querySelector('svg[aria-label="Home"]') !== null;
  });
  
  console.log("Is logged in:", isLoggedIn);

  const allResults = [];
  for (const handle of TARGET_HANDLES) {
    const r = await scrapeHandle(page, handle);
    allResults.push(...r);
  }

  await saveCookies(context);
  await browser.close();

  // Save all results to JSON file for debugging
  const outputFile = `instagram_scrape_${new Date().toISOString().split('T')[0]}.json`;
  const outputData = {
    scrapedAt: new Date().toISOString(),
    scrapedCount: allResults.length,
    results: allResults,
    summary: allResults.map((x) => ({
      postId: x.postId,
      title: x.normalized.title,
      when: x.normalized.startTimeLocal,
      loc: x.normalized.locationName,
      src: x.normalized.sourceOrg,
      confidence: x.normalized.confidence
    }))
  };
  
  writeFileSync(outputFile, JSON.stringify(outputData, null, 2), "utf8");
  console.log(`\n✅ Saved ${allResults.length} scraped posts to ${outputFile}`);
  console.log(
    JSON.stringify(
      {
        scrapedCount: allResults.length,
        events: outputData.summary
      },
      null,
      2
    )
  );
})();
