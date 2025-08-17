import "dotenv/config";

import { LATEST_API_VERSION, Session, shopifyApi } from "@shopify/shopify-api";
import express, { Request, Response } from "express";

// --- CONFIGURATION ---
// Replace these with your actual Shopify App credentials.
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY as string;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET as string;

const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env
  .SHOPIFY_ADMIN_ACCESS_TOKEN as string;
const SHOP_NAME = process.env.SHOP_NAME as string;

const app = express();
const port = process.env.PORT || 3000;

// Initialize the Shopify API client
const shopify = shopifyApi({
  apiKey: SHOPIFY_API_KEY,
  apiSecretKey: SHOPIFY_API_SECRET,
  apiVersion: LATEST_API_VERSION,
  adminApiAccessToken: SHOPIFY_ADMIN_ACCESS_TOKEN,
  isCustomStoreApp: true, // Set this to true for custom apps
  scopes: ["read_customers"], // Define the scopes your app needs
  hostName: "localhost",
  isEmbeddedApp: true,
});

// --- API ROUTE ---
app.get("/user-data", async (req: Request, res: Response) => {
  const userId = req.query.user_id as string;

  if (!userId) {
    return res.status(400).json({ error: "user_id is required" });
  }

  if (
    !SHOPIFY_ADMIN_ACCESS_TOKEN ||
    SHOPIFY_ADMIN_ACCESS_TOKEN.startsWith("shpat_")
  ) {
    return res
      .status(500)
      .json({ error: "Shopify Admin API access token is not configured." });
  }

  try {
    // Create a new session for the Admin API call
    const session = new Session({
      id: `offline_${SHOP_NAME}`,
      shop: SHOP_NAME,
      state: "state",
      isOnline: false,
      accessToken: SHOPIFY_ADMIN_ACCESS_TOKEN,
    });

    const client = new shopify.clients.Graphql({ session });

    // GraphQL query to fetch customer data and metafields
    const query = `
      query getCustomer($id: ID!) {
        customer(id: $id) {
          firstName
          metafield(namespace: "custom", key: "profile_image") {
            value
          }
          assignedProduct: metafield(namespace: "custom", key: "assigned_product") {
            reference {
              ... on Product {
                title
                vendor
                onlineStoreUrl
                featuredImage {
                  url
                }
              }
            }
          }
        }
      }
    `;

    const variables = { id: `gid://shopify/Customer/${userId}` };

    const response = await client.query({
      data: { query, variables },
    });

    // @ts-ignore
    const customerData = response.body.data.customer;

    if (!customerData) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Format the response to match the frontend's expectations
    const formattedResponse = {
      first_name: customerData.firstName,
      profile_image: customerData.metafield?.value,
      assigned_product: customerData.assignedProduct?.reference
        ? {
            title: customerData.assignedProduct.reference.title,
            vendor: customerData.assignedProduct.reference.vendor,
            url: customerData.assignedProduct.reference.onlineStoreUrl,
            image: customerData.assignedProduct.reference.featuredImage?.url,
          }
        : null,
    };

    res.json(formattedResponse);
  } catch (error) {
    console.error("Error fetching data from Shopify:", error);
    res.status(500).json({ error: "Failed to fetch data from Shopify" });
  }
});

// --- SERVER START ---
app.listen(port, () => {
  console.log(`Backend server is running at http://localhost:${port}`);
});
