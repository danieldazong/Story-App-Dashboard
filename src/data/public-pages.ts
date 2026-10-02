// The public pages at talebrim.com/terms, /privacy, /help and /delete-account,
// for the Talebrim mobile app's readers and its Google Play listing (the app's
// prompt 25 follow-up, 2026-10-01). Content only: the pages render it through
// `components/public/public-document.tsx`.
//
// Every statement here describes what the app actually does. When the app
// changes what it collects (rewarded ads, next), change these pages in the
// same change, and move `updated`. The subscription status kept on our
// servers, and the RevenueCat customer deleted with the account, were added
// with the mobile app's prompt 22a (2026-10-02).

/**
 * Where readers write to: the parent company Nouvrix's inbox (the owner,
 * 2026-10-01). The `contact-support` function's `SUPPORT_EMAIL_TO` holds the
 * same address: change both together. The app shows no address.
 */
export const SUPPORT_EMAIL = "support@nouvrix.com";

/**
 * Who provides Talebrim (the owner, 2026-10-02): Nouvrix LLC, registered in
 * North Carolina, United States, whose law governs the Terms.
 */
const OPERATOR = "Nouvrix LLC";
const OPERATOR_FULL = `${OPERATOR}, a limited liability company registered in North Carolina, United States`;

/** The footer's line under the links, on every page. */
export const OPERATOR_LINE = `Talebrim is provided by ${OPERATOR}, North Carolina, United States.`;

/** A run of text, or a link inside it. */
export type Inline = string | { text: string; href: string };

export type Block =
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "steps"; items: Inline[][] };

export type PublicSection = {
  /** The section's anchor, so a link can point at it (`/help#downloads`). */
  id: string;
  heading: string;
  blocks: Block[];
};

export type PublicDocument = {
  path: "/terms" | "/privacy" | "/help" | "/delete-account";
  title: string;
  /** The footer's short name for it. */
  navLabel: string;
  /** For search results and link previews. */
  description: string;
  /** When the text last changed, as readers see it ("1 October 2026"). */
  updated: string;
  intro: Block[];
  sections: PublicSection[];
};

const UPDATED = "2 October 2026";

function email(subject?: string): Inline {
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : "";
  return { text: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}${query}` };
}

function p(...content: Inline[]): Block {
  return { kind: "paragraph", content };
}

function list(...items: Inline[][]): Block {
  return { kind: "list", items };
}

function steps(...items: Inline[][]): Block {
  return { kind: "steps", items };
}

export const PRIVACY_POLICY: PublicDocument = {
  path: "/privacy",
  title: "Privacy Policy",
  navLabel: "Privacy",
  description: "What the Talebrim app collects, why, who processes it for us, and how to delete it.",
  updated: UPDATED,
  intro: [
    p(
      "Talebrim is an app for reading and listening to serialized stories. This policy explains what we collect when you use the app or talebrim.com, why we collect it, who processes it for us, and the choices you have.",
    ),
    p("We don't sell your personal information, and we don't use it for advertising."),
  ],
  sections: [
    {
      id: "who-we-are",
      heading: "Who we are",
      blocks: [
        p(
          `Talebrim is provided by ${OPERATOR_FULL} ("we", "us"). We're responsible for the personal information this policy describes. You can reach us at `,
          email(),
          ".",
        ),
      ],
    },
    {
      id: "what-we-collect",
      heading: "What we collect",
      blocks: [
        list(
          [
            "Account details. Our sign-in provider, Clerk, stores your email address. If you sign in with Google, it also receives the name and profile photo on your Google account. The app shows that photo on your Profile, or your initials if your account has none.",
          ],
          [
            "Reading activity. So you can pick up where you left off on any device, we store your place in each chapter you open (a position in the text and in the narration, and whether you were last reading or listening), the stories on your My List, and the chapters unlocked on your account. We also keep the genres you chose when you joined, and when you last looked at new chapters.",
          ],
          [
            "Notification token. If you turn on new-chapter alerts, we store a token that lets us send alerts to your phone. Turning alerts off, or signing out, releases it.",
          ],
          [
            "Usage analytics. We record how the app is used: for example, which screens are opened, when a chapter is started or finished, and whether a download or a purchase worked. Each event carries technical details: the app's version, your device's make and model, its operating system and version, and its screen size. Events are linked to your account's ID, never to your name or email, and never include what you search for or the text you read. We don't store your IP address or your location. You can turn analytics off at any time in Profile → Usage analytics.",
          ],
          [
            "Purchases. If you subscribe, Google Play handles the payment, and we never see your payment details. We receive the status of your subscription, such as whether it's active and when it renews. Our subscription service, RevenueCat, receives your account's ID and your purchase receipts in order to check it. We also keep your subscription's status on our servers (whether it's active, when it ends, and the plan and store it came from), so the chapters it opens can be served to you.",
          ],
          [
            "Messages. When you write to us from Profile → Help, your message reaches us by email with your account's email address and ID, your name if your account has one, the app's version and your phone's model, so we can reply and look into it. Whether you write from the app or by email, we keep the conversation so we can help you.",
          ],
          [
            "On your phone. The app keeps your reading settings, a cache of stories and chapters so it opens quickly, and any chapters you download, in its own storage on your phone. Signing out removes the cache and the downloads. Your reading settings stay on the phone.",
          ],
        ),
      ],
    },
    {
      id: "how-we-use-it",
      heading: "How we use it",
      blocks: [
        list(
          ["to run your account and keep you signed in;"],
          ["to keep your reading and listening place in step across your devices, with your My List and your unlocked chapters;"],
          ["to send the new-chapter alerts you've asked for;"],
          ["to check whether you have an active subscription, and serve the chapters it opens;"],
          ["to understand how the app is used and fix what doesn't work, through analytics you can turn off;"],
          ["to answer your messages, and to keep the service and your account secure."],
        ),
      ],
    },
    {
      id: "who-processes-it",
      heading: "Who processes it for us",
      blocks: [
        list(
          ["Clerk: sign-in and account management."],
          [
            "Supabase: the database and storage that hold your reading activity, My List, unlocked chapters, subscription status and notification token, and the stories themselves.",
          ],
          ["PostHog: usage analytics."],
          ["Expo and Google Firebase Cloud Messaging: delivering new-chapter alerts to your phone."],
          ["Google Play and RevenueCat: subscriptions and purchases."],
          ["Resend: delivering the messages you send us from the app."],
          ["Vercel: hosting talebrim.com."],
        ),
        p(
          "They process data on our behalf, under their own security and privacy commitments. Most of them store data in the United States, so your data may be transferred there.",
        ),
      ],
    },
    {
      id: "how-long-we-keep-it",
      heading: "How long we keep it",
      blocks: [
        p(
          "We keep your account and reading data for as long as you have an account. When you delete your account, we delete your account details, reading places, My List, unlocked chapters, subscription status, notification token, your record at RevenueCat, and your analytics profile and events. PostHog removes the events in the background, which can take some time.",
        ),
        p(
          "Google Play keeps its own records of your purchases. Copies of deleted data can remain in our providers' backups for a limited time before they're overwritten.",
        ),
      ],
    },
    {
      id: "your-choices",
      heading: "Your choices and rights",
      blocks: [
        list(
          ["Turn analytics off in Profile → Usage analytics."],
          ["Turn new-chapter alerts on or off in Profile → New chapter alerts."],
          [
            "Delete your account in Profile → Delete account, or by following the steps on our ",
            { text: "account deletion page", href: "/delete-account" },
            ".",
          ],
          ["Ask us for a copy of your data, or to correct it, by emailing ", email(), "."],
        ),
        p(
          "Depending on where you live, you may have further rights under data protection law, such as to object to how we use your data, or to complain to your data protection authority.",
        ),
      ],
    },
    {
      id: "children",
      heading: "Children",
      blocks: [
        p(
          "Talebrim is for adults. You must be 18 or older to use it, and we don't knowingly collect data from anyone younger. If you believe someone under 18 has an account, contact us and we'll delete it.",
        ),
      ],
    },
    {
      id: "security",
      heading: "Security",
      blocks: [
        p(
          "Data travels over encrypted connections. Your reading data can be read only by your own account, which the database itself enforces.",
        ),
      ],
    },
    {
      id: "changes",
      heading: "Changes to this policy",
      blocks: [
        p(
          "When we change this policy, we update the date at the top. If a change is significant, we'll tell you in the app before it takes effect.",
        ),
      ],
    },
    {
      id: "contact",
      heading: "Contact",
      blocks: [p(`${OPERATOR}, North Carolina, United States. Questions or requests about your data: `, email(), ".")],
    },
  ],
};

export const TERMS_OF_SERVICE: PublicDocument = {
  path: "/terms",
  title: "Terms of Service",
  navLabel: "Terms",
  description: "The terms for using the Talebrim app and talebrim.com.",
  updated: UPDATED,
  intro: [
    p(
      `These terms are an agreement between you and ${OPERATOR_FULL} ("we", "us"), which provides Talebrim. They apply when you use the Talebrim app or talebrim.com. By creating an account or using the app, you agree to them. Please read them with our `,
      { text: "Privacy Policy", href: "/privacy" },
      ".",
    ),
  ],
  sections: [
    {
      id: "who-can-use-talebrim",
      heading: "Who can use Talebrim",
      blocks: [
        p(
          "You must be at least 18 years old. The stories on Talebrim are written for adults, and many are labelled Mature 18+.",
        ),
        p(
          "You need an account to read or listen. Keep your sign-in secure, and tell us if you think someone else is using your account.",
        ),
      ],
    },
    {
      id: "what-talebrim-offers",
      heading: "What Talebrim offers",
      blocks: [
        p(
          "Talebrim offers serialized stories to read, many of which you can also listen to. We add stories and chapters over time, and we may change, update or remove stories and features.",
        ),
        p("Some chapters are free. Others are locked until they are unlocked on your account or you subscribe."),
      ],
    },
    {
      id: "subscription",
      heading: "The Talebrim Unlimited subscription",
      blocks: [
        list(
          ["Talebrim Unlimited unlocks the chapters that are locked. Its plans and prices are shown in the app before you buy."],
          ["Payment is handled by Google Play and charged to your Google account."],
          [
            "A subscription renews automatically at the end of each period until you cancel it. You can cancel at any time in Google Play, and you keep access until the end of the period you've paid for.",
          ],
          ["Refunds are handled under Google Play's refund policy."],
          ["Deleting your Talebrim account doesn't cancel a subscription. Cancel it in Google Play first."],
          ["After reinstalling the app or changing phones, use Restore purchase in Profile."],
        ),
      ],
    },
    {
      id: "downloads",
      heading: "Downloads",
      blocks: [
        p(
          "In the Android app you can download chapters to read and listen without a connection. Downloads are copies kept inside the app, for your personal use. They open offline for 30 days after the app last checked them online, and they're removed when you sign out or lose access to the chapter.",
        ),
      ],
    },
    {
      id: "using-the-stories",
      heading: "Using the stories",
      blocks: [
        p(
          "The stories, including their text, narration and artwork, belong to Nouvrix LLC or to their authors and licensors. We give you a personal, non-transferable licence to read and listen to them in the app, for your own non-commercial use.",
        ),
        p(
          "Don't copy, record, share, sell or publish them, and don't try to get around locked chapters or the limits on downloads.",
        ),
      ],
    },
    {
      id: "acceptable-use",
      heading: "Acceptable use",
      blocks: [
        p(
          "Don't misuse Talebrim. That means no reverse engineering or tampering with the app, no automated access or scraping, no attempts to get into other people's accounts or our systems, and nothing unlawful.",
        ),
      ],
    },
    {
      id: "ending",
      heading: "Ending your use",
      blocks: [
        p(
          "You can stop using Talebrim at any time, and delete your account in Profile → Delete account. We may suspend or close an account that breaks these terms. We'll tell you why, unless the law or security stops us.",
        ),
      ],
    },
    {
      id: "disclaimers",
      heading: "Disclaimers",
      blocks: [
        p(
          "We work to keep Talebrim available and working well, but it is provided as it is and as available, without warranties beyond those the law requires.",
        ),
      ],
    },
    {
      id: "liability",
      heading: "Our liability",
      blocks: [
        p(
          "To the extent the law allows, we aren't liable for indirect or consequential losses, and our total liability to you is limited to the amount you paid for Talebrim in the 12 months before your claim. Nothing in these terms limits liability that the law doesn't allow us to limit.",
        ),
      ],
    },
    {
      id: "governing-law",
      heading: "Governing law",
      blocks: [
        p(
          "These terms are governed by the laws of the State of North Carolina, United States, without regard to its conflict-of-law rules. If you live outside the United States, you keep any protection that the consumer laws of your country give you and that can't be waived by agreement.",
        ),
      ],
    },
    {
      id: "changes",
      heading: "Changes to these terms",
      blocks: [
        p(
          "We may update these terms. When we do, we change the date at the top, and we tell you in the app before a significant change takes effect. If you keep using Talebrim after that, the updated terms apply.",
        ),
      ],
    },
    {
      id: "contact",
      heading: "Contact",
      blocks: [p(`${OPERATOR}, North Carolina, United States. Questions about these terms: `, email(), ".")],
    },
  ],
};

export const HELP: PublicDocument = {
  path: "/help",
  title: "Help",
  navLabel: "Help",
  description: "Reading and listening, downloads, new-chapter alerts, subscriptions and your account in Talebrim.",
  updated: UPDATED,
  intro: [p("Answers to common questions about the Talebrim app. Can't find yours? Email ", email(), ".")],
  sections: [
    {
      id: "getting-started",
      heading: "Getting started",
      blocks: [
        p(
          "Sign in with your email address (we send you a code) or with Google. You must be 18 or older. The first time, pick the genres you like, or skip.",
        ),
      ],
    },
    {
      id: "reading-and-listening",
      heading: "Reading and listening",
      blocks: [
        p(
          "Open a story and tap Read or Listen. While you read, tap Listen to hear the chapter from about where you are. In the player, tap Read instead to go back to the text.",
        ),
        p(
          "Your place is saved to your account, so it follows you to your other devices. Continue, on Discover and in Library, takes you back to it.",
        ),
      ],
    },
    {
      id: "reading-settings",
      heading: "Reading settings",
      blocks: [
        p(
          "In the reader, tap Aa to change the text size, the theme (light, sepia or dark) and the line spacing, or to turn on the Atkinson Hyperlegible font. The same settings are in Profile → Reading preferences.",
        ),
      ],
    },
    {
      id: "locked-chapters",
      heading: "Locked chapters and Talebrim Unlimited",
      blocks: [
        p(
          "Some chapters are locked. The Talebrim Unlimited subscription unlocks them: tap See plans on a locked chapter, or in Profile.",
        ),
        p(
          "Subscribed already, on a new phone? Use Restore purchase in Profile. To change or cancel your plan, use Manage subscription in Profile, or Google Play.",
        ),
      ],
    },
    {
      id: "downloads",
      heading: "Downloads",
      blocks: [
        p(
          "In the Android app, tap the download button on a story's page to download all of its chapters, or long-press a chapter in the chapter list to download just that one.",
        ),
        p(
          "Downloaded chapters read and play without a connection for 30 days after the app last checked them online. Find and remove them in Profile → Downloads & offline storage. Signing out removes them from your phone.",
        ),
      ],
    },
    {
      id: "my-list-and-alerts",
      heading: "My List and new chapters",
      blocks: [
        p(
          "Tap + My List on a story's page to save it. The bell on Discover shows the new chapters of the stories on your list.",
        ),
        p(
          "To get an alert on your phone when a new chapter comes out, turn on Profile → New chapter alerts. Alerts are available in the Android app.",
        ),
      ],
    },
    {
      id: "your-account",
      heading: "Your account",
      blocks: [
        p("Sign out in Profile. Signing out removes your downloaded chapters from the phone."),
        p(
          "Deleting your account, in Profile → Delete account, removes your account and everything saved to it. See ",
          { text: "Delete your Talebrim account", href: "/delete-account" },
          ".",
        ),
        p("To stop sharing usage analytics, turn off Profile → Usage analytics."),
      ],
    },
    {
      id: "contact",
      heading: "Contact us",
      blocks: [
        p(
          "Still stuck? In the app, go to Profile → Help and send us a message: it tells us your app's version and your phone's model for you, and we reply to your account's email. Or email ",
          email(),
          " and tell us your phone's model and what happened.",
        ),
      ],
    },
  ],
};

export const DELETE_ACCOUNT: PublicDocument = {
  path: "/delete-account",
  title: "Delete your Talebrim account",
  navLabel: "Delete your account",
  description: "How to delete your Talebrim account and its data, in the app or by email, and what is deleted.",
  updated: UPDATED,
  intro: [
    p(
      `You can delete your Talebrim account at any time. Deleting it removes your account and the data saved to it, and it can't be undone. Talebrim is provided by ${OPERATOR}.`,
    ),
  ],
  sections: [
    {
      id: "in-the-app",
      heading: "In the app",
      blocks: [
        steps(
          ["Open Talebrim and sign in."],
          ["Go to Profile."],
          ["Tap Delete account, then Delete account again to confirm."],
        ),
        p("Your account is deleted straight away, and the app signs you out."),
      ],
    },
    {
      id: "by-email",
      heading: "Without the app",
      blocks: [
        p(
          "Email ",
          email("Delete my account"),
          " from the email address on your account, with the subject \"Delete my account\". We'll delete the account within 30 days and reply to confirm. If you write from a different address, we'll ask you to confirm from the one on the account.",
        ),
      ],
    },
    {
      id: "what-is-deleted",
      heading: "What's deleted",
      blocks: [
        list(
          ["your account: your email address, and your name and photo if you signed in with Google;"],
          ["your reading and listening places;"],
          ["your My List;"],
          ["the chapters unlocked on your account;"],
          ["your subscription status, and your record at RevenueCat, our subscription service;"],
          ["the token used to send you new-chapter alerts;"],
          ["your usage analytics profile and its events."],
        ),
        p("Downloaded chapters and the app's other data on your phone are removed when the app signs you out."),
      ],
    },
    {
      id: "what-is-kept",
      heading: "What's kept",
      blocks: [
        list(
          [
            "Google Play keeps its own records of your purchases. Deleting your account doesn't cancel a Talebrim Unlimited subscription: cancel it in Google Play first, or it will keep renewing.",
          ],
          ["Copies of deleted data can remain in our providers' backups for a limited time before they're overwritten."],
          ["If you've written to us, from the app or by email, we keep that conversation for as long as we need it to help you."],
        ),
      ],
    },
  ],
};

/** The pages, in the order the footer lists them. */
export const PUBLIC_PAGES = [HELP, TERMS_OF_SERVICE, PRIVACY_POLICY, DELETE_ACCOUNT] as const;
