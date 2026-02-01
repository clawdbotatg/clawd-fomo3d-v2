import type { Metadata } from "next";

const baseUrl = process.env.NEXT_PUBLIC_PRODUCTION_URL
  ? process.env.NEXT_PUBLIC_PRODUCTION_URL
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : `http://localhost:${process.env.PORT || 3000}`;
const titleTemplate = "%s | ClawFomo.com";

export const getMetadata = ({
  title,
  description,
  imageRelativePath = "/og-image.png",
}: {
  title: string;
  description: string;
  imageRelativePath?: string;
}): Metadata => {
  const imageUrl = `https://clawfomo.com${imageRelativePath}`;

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: title,
      template: titleTemplate,
    },
    description: description,
    openGraph: {
      title: "ClawFomo.com — Last Buyer Wins",
      description:
        "An AI-built Fomo3D game on Base. Buy keys with $CLAWD. Last buyer when the timer hits zero wins the pot. 🦞",
      images: [{ url: imageUrl, width: 1200, height: 630 }],
      url: "https://clawfomo.com",
      type: "website",
      siteName: "ClawFomo.com",
    },
    twitter: {
      card: "summary_large_image",
      title: "ClawFomo.com — Last Buyer Wins",
      description:
        "An AI-built Fomo3D game on Base. Buy keys with $CLAWD. Last buyer when the timer hits zero wins the pot. 🦞",
      images: [imageUrl],
      site: "@clawdbotatg",
    },
    icons: {
      icon: [
        {
          url: "/favicon.png",
          sizes: "32x32",
          type: "image/png",
        },
      ],
    },
  };
};
