//Environment variables
const cron = require("node-cron");
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const cors = require("cors");
const app = express();
const port = process.env.PORT ?? 8001;
const { XMLParser } = require("fast-xml-parser");
const fs = require("fs");
const cloudinary = require("cloudinary");

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

// middleware & static files
// app.use(cors());
// app.use(bodyParser.json());
// app.use(express.json());

cloudinary.config({
  cloud_name: "du7e4ltoq",
  api_key: "536563588992832",
  api_secret: "ixMlmmwQfm1BKclbbPLXn5AuNtU",
});
//Constants and variables
const siteId = "64a57674f0a3977d20e3865b";
const config = {
  headers: {
    Authorization: `Bearer 3588c873fdc9a472583c06d2e04973049d787e20e7fa54e6485fad715ce4753f`,
    "accept-version": "1.0.0",
    "content-type": "application/json",
  },
};
const collectionId = "64aaff5935018faa5a99900f";
const domains = {
  domains: ["carmoji-ca.webflow.io"],
};

const REQUEST_DELAY = 1000;
let numOfItems = 0,
  remaining = 0,
  dealership_info = {},
  vehicles = [],
  uploadedItems = 0,
  deletedItems = 0;

// Call the script
app.get("/script", async (req, res, next) => {
  res.send("Script started running.");
  console.log(
    "######################################## THE SCRIPT IS RUNNING THROUGH THE WEBSITE ########################################"
  );
  runScript();
});
app.all("", async (req, res) => {
  cleanup();
});
const runScript = () => {
  resetVariables();
  // Fetching old items to delete
  fetchAllItems();
};
// Fetch all current items in the CMS
const fetchAllItems = async () => {
  url = `https://api.webflow.com/collections/${collectionId}/items`;
  try {
    const items = await axios.get(url, config);
    console.log("ITEMS FETCHED SUCCESSFULLY");
    const data = items.data.items;
    numOfItems = data.length;
    console.log("Number of current items is: ", numOfItems);
    console.log("First, delete all items");
    deleteItems(data);
  } catch (e) {
    console.log("Couldn't fetch all items ", e);
  }
};
// Recursively deleting all items
const deleteItems = async (items) => {
  if (numOfItems > 0) {
    const item = items[deletedItems];
    if (!item) return;
    const itemId = item._id;
    console.log(
      "number of deleted items is ",
      deletedItems,
      " out of ",
      numOfItems
    );
    const url = `https://api.webflow.com/collections/${collectionId}/items/${itemId}`;
    try {
      await axios.delete(url, config);
      deletedItems++;
      console.log("Item deleted successfully", item.name);
    } catch (e) {
      console.log("Couldn't delete the item ", item.name);
    }
  }
  if (deletedItems == numOfItems) {
    // If all items have been deleted
    console.log(
      "All items deleted successfully. Number of items deleted is ",
      deletedItems
    );
    // Publishing the website before adding new items
    const url = `https://api.webflow.com/sites/${siteId}/publish`;
    axios
      .post(url, domains, config)
      .then(async () => {
        console.log("Website Published Successfully!");
        await updateCMS();
      })
      .catch((e) => console.log("Couldn't publish website, ", e));
  } else setTimeout(deleteItems, REQUEST_DELAY, items);
};
// Update Webflow CMS via the script
const updateCMS = async () => {
  const url = "http://mediafeed.boostmotorgroup.com/2438/export.xml";
  const result = await axios.get(url);
  const data = result.data;
  const parser = new XMLParser({ ignoreAttributes: false });
  const json = parser.parse(data);
  const dealership = json["Datafeed"]["Dealership"];
  // Dealership data
  dealership_info = {
    Dealership_Boost_ID: dealership["Dealership_Boost_ID"],
    Dealership_Other_ID: dealership["Dealership_Other_ID"],
    Dealership_Name: dealership["Dealership_Name"],
    Dealership_Website: dealership["Dealership_Website"],
    Dealership_Phone: dealership["Dealership_Phone"],
    Dealership_Email: dealership["Dealership_Email"],
    Dealership_Address: dealership["Dealership_Address"],
    Dealership_City: dealership["Dealership_City"],
    Dealership_Postal: dealership["Dealership_Postal"],
    Dealership_Province: dealership["Dealership_Province"],
    Dealership_Latitude: dealership["Dealership_Latitude"],
    Dealership_Longitude: dealership["Dealership_Longitude"],
  };
  vehicles = dealership["Inventory"]["Vehicle"];
  numOfItems = vehicles.length;
  console.log("Total number of items: ", numOfItems);

  // Delete to avoid memory leak
  delete json, dealership, parser;
  // XML data retrieved
  addNextItem();
};
// Adding an item to webflow
const addNextItem = async () => {
  try {
    const item = await getNextItem();

    const url = `https://api.webflow.com/collections/${collectionId}/items`;
    const data = JSON.stringify({ fields: item });
    try {
      // Adding the item to webflow
      console.log(
        "Uploading item " + ++uploadedItems + " of " + numOfItems + " items."
      );
      const result = await axios.post(url, data, config);
      console.log("Item uploaded successfully");
      if (uploadedItems < numOfItems) setTimeout(addNextItem, REQUEST_DELAY);
      else cleanup();
    } catch (e) {
      console.log(
        "#######################################ERROR BEGIN######################"
      );
      console.log(e.response.data);
      console.log(
        "#######################################ERROR END######################"
      );
      setTimeout(addNextItem, REQUEST_DELAY);
    }
  } catch (e) {
    console.log("Couldn't get next item: ", e);
  }
};
// Returns the next item after changing it to JSON
const getNextItem = async () => {
  const vehicle_info = vehicles[remaining++];

  let vehicle = { ...dealership_info, ...vehicle_info };
  // use the first image as the main one
  let imageGallery = [];
  let main_img_url =
    "https://media.getedealer.com/w_400,h_300,q_90,c_l,v1/inventory/6RHU7CPFWRG7TFNE6JCXOPN42Y.webp";
  if (vehicle["Images"]["@_count"] == "1")
    main_img_url = vehicle["Images"]["Photo"]["#text"];
  else if (vehicle["Images"]["@_count"] != "0") {
    // use the next maximum of 25 images in the multi-image field
    main_img_url = vehicle["Images"]["Photo"][0]["#text"];
    const images = vehicle["Images"]["Photo"].slice(1);
    let i = 0;
    images.every((image) => {
      if (i == 25) return false;
      imageGallery.push({ url: image["#text"] });
      i += 1;
      return true;
    });
  }
  vehicle["Main_Image"] = { url: main_img_url };
  vehicle["Images"] = imageGallery;
  // store the other multivalues into strings
  vehicle["Features"] = JSON.stringify(vehicle["Features"]);
  vehicle["Model"] = vehicle["Model"].toString();
  vehicle["Certified"] = vehicle["Certified"].toString();
  vehicle["Special"] = vehicle["Special"].toString();
  vehicle["Interior_Features"] = JSON.stringify(vehicle["Interior_Features"]);
  vehicle["Exterior_Features"] = JSON.stringify(vehicle["Exterior_Features"]);
  vehicle["Safety_Features"] = JSON.stringify(vehicle["Safety_Features"]);
  key_list = [
    "_draft",
    "_archived",
    "price2",
    "price",
    "seats",
    "doors",
    "mileage",
    "year",
    "vehiclestatus",
    "special",
    "certified",
    "features",
    "safety-features",
    "exterior-features",
    "interior-features",
    "interior-colour",
    "exterior-colour",
    "body-style",
    "submodel-trim",
    "dealership-name",
    "main-image",
    "images",
    "transmission",
    "model",
    "make",
    "name",
    "dealership-boost-id",
  ];
  let vehicle_temp = {};
  // set keys to lowercase and replace underscore with a dash (to match webflow naming)
  for (const key in vehicle)
    vehicle_temp[key.toLowerCase().replace("_", "-")] = vehicle[key];
  vehicle = vehicle_temp;
  // add necessary webflow cms api keys
  vehicle["name"] = vehicle["vin"];
  vehicle["_archived"] = false;
  vehicle["_draft"] = false;
  vehicle_temp = {};

  // filter out the not-needed keys
  Object.entries(vehicle).forEach(([key, value]) => {
    if (key_list.includes(key)) vehicle_temp[key] = value;
  });
  vehicle = vehicle_temp;
  try {
    // reupload main image
    console.log("Reuploading main image");
    vehicle["main-image"]["url"] = await reuploadImage(
      vehicle["main-image"]["url"]
    );
    console.log("main image reuploaded");
    // reupload gallery images
    console.log("Reuploading IMAGE GALLERY");
    for (let i = 0; i < vehicle["images"].length; i += 1)
      vehicle["images"][i]["url"] = await reuploadImage(
        vehicle["images"][i]["url"]
      );
    console.log("IMAGE GALLERY UPLOADED");
    return vehicle;
  } catch (e) {
    console.log("Couldn't upload image ", e);
  }
};
// Download the image, upload it to cloudinary, save the URL, then delete it from the server.
const reuploadImage = async (boost_url) => {
  const filepath = boost_url.split("/").slice(-1)[0].replace(/%20/g, "_");
  const filename = filepath.split(".")[0];
  console.log("downloading image ", filename);
  try {
    await downloadImage(boost_url, filepath);
    // console.log("Image downloaded");
    const result = await cloudinary.v2.uploader.upload(filepath, {
      public_id: filename,
    });
    // console.log("Image uploaded: ", result.url);
    await fs.unlinkSync(filepath);
    // console.log("Image deleted: ", filepath);
    return result.url;
  } catch (e) {
    console.log("Couldn't reupload images", e);
  }
};
async function downloadImage(url, filepath) {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });
  return new Promise((resolve, reject) => {
    response.data
      .pipe(fs.createWriteStream(filepath))
      .on("error", reject)
      .once("close", () => resolve(filepath));
  });
}
// delete cloudinary images and publish the website
const cleanup = async () => {
  resetVariables();
  const url = `https://api.webflow.com/sites/${siteId}/publish`;
  axios
    .post(url, domains, config)
    .then(async () => {
      console.log("Website Published Successfully!");
    })
    .catch((e) => console.log("Couldn't publish website, ", e));
  const result = await cloudinary.v2.api.delete_all_resources();
  console.log("All cloud images deleted. Clean up completed");
};
// Resetting variables
const resetVariables = () => {
  numOfItems = remaining = uploadedItems = deletedItems = 0;
  dealership_info = {};
  vehicles = [];
};
// Will execute every day at midnight GMT-5
cron.schedule(
  "0 0 0 * * *",
  () => {
    console.log(
      "######################################## THE SCRIPT IS RUNNING THROUGH THE CRON JOB ########################################"
    );
    runScript();
  },
  {
    scheduled: true,
    timezone: "Etc/GMT+2",
  }
);
