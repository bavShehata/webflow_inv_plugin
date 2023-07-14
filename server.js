//Environment variables
const cron = require("croner");
const express = require("express");
const axios = require("axios");
const app = express();
const port = process.env.PORT ?? 8001;
const { XMLParser } = require("fast-xml-parser");
const fs = require("fs");
const cloudinary = require("cloudinary");
const he = require("he");

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

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
  // Fetching old items to delete
  fetchAllItems();
};
// Fetch all current items in the CMS and API
const fetchAllItems = async () => {
  url = `https://api.webflow.com/collections/${collectionId}/items`;
  try {
    const items = await axios.get(url, config);
    console.log("ITEMS FETCHED SUCCESSFULLY");

    // Get the two sets of vehicles
    let vehicles_webflow = items.data.items;
    console.log("Number of fetched items: ", vehicles_webflow.length);
    let vehicle_names = [];
    vehicles_webflow.forEach((vehicle) => vehicle_names.push(vehicle["name"]));
    console.log("Parsing XML vehicles");
    let vehicles_boost = await getVehiclesInfo(vehicle_names, true);
    const toRemove = vehicles_webflow.filter(
      (a) => !vehicles_boost.some((b) => a.name == b.name)
    );
    const toAdd = vehicles_boost.filter(
      (a) => !vehicles_webflow.some((b) => a.name == b.name)
    );
    if (toAdd.length == 0 && toRemove.length == 0) {
      console.log("No updates needed. Script aborting");
    } else {
      await updateCMS(toRemove, toAdd);
    }
  } catch (e) {
    console.log("Couldn't fetch all items ", e);
  }
};
const getVehiclesInfo = async (current_vehicle_names, reuploadImages) => {
  const url = "http://mediafeed.boostmotorgroup.com/2438/export.xml";
  const result = await axios.get(url);
  const data = result.data;
  const parser = new XMLParser({ ignoreAttributes: false });
  const json = parser.parse(data);
  const dealership = json["Datafeed"]["Dealership"];
  // Dealership data
  const dealership_info = {
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
  let vehicles = dealership["Inventory"]["Vehicle"];
  let parsed_vehicles = [];
  // Delete to avoid memory leak
  delete json, dealership, parser;

  for (let i = 0; i < vehicles.length; i++) {
    let vehicle_info = vehicles[i];
    let vehicle = { ...dealership_info, ...vehicle_info };
    console.log(`Parsing vehicle number ${i + 1}/${vehicles.length}`);
    vehicle = await parseVehicle(
      current_vehicle_names,
      vehicle,
      reuploadImages
    );
    parsed_vehicles.push(vehicle);
  }
  // Delete to avoid memory leak
  delete vehicles, dealership_info;
  return parsed_vehicles;
};
// Update Webflow CMS via the script
const updateCMS = async (toRemove, toAdd) => {
  // Delete items
  await deleteItems(toRemove);
  // Add items
  await addItems(toAdd);
};
// deleting old items
const deleteItems = async (oldItems) => {
  numOldItems = oldItems.length;
  console.log("Number of old items to delete: ", numOldItems);
  console.log("Deleting items:");
  for (let i = 0; i < numOldItems; i += 1) {
    const item = items[i];
    if (!item) return;
    const itemId = item._id;
    const url = `https://api.webflow.com/collections/${collectionId}/items/${itemId}`;
    try {
      await axios.delete(url, config);
      console.log(`${i + 1}/${numOldItems}. item name: ${item.name}`);
    } catch (e) {
      console.log("Couldn't delete the item ", item.name);
      console.log(e);
    }
    // add delay time
    await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY));
  }
  // If all items have been deleted
  console.log("Items deleted successfully.");
};
// Adding an item to webflow
const addItems = async (newItems) => {
  numNewItems = newItems.length;
  console.log("Number of new items to upload: ", numNewItems);
  console.log("Uploading items:");
  const url = `https://api.webflow.com/collections/${collectionId}/items`;
  for (let i = 0; i < numNewItems; i += 1) {
    const item = newItems[i];
    const data = JSON.stringify({ fields: item });
    try {
      // Adding the item to webflow
      await axios.post(url, data, config);
      console.log(`${i + 1}/${numNewItems}. item name: ${item.name}`);
    } catch (e) {
      console.log("Couldn't upload item");
      console.log(
        "#######################################ERROR BEGIN######################"
      );
      console.log(e.response.data);
      console.log(
        "#######################################ERROR END######################"
      );
    }
    // add delay time
    await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY));
  }
  console.log("Items uploaded successfully");
  cleanup();
};
// Parses vehicle to JSON that's compliant with Webflow CMS API
const parseVehicle = async (current_vehicle_names, vehicle, reuploadImages) => {
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
    "name",
    "dealership-boost-id",
    "stock-number-2",
    "images",
    "year",
    "make",
    "model",
    "submodel-trim",
    "body-style",
    "exterior-colour",
    "interior-colour",
    "mileage",
    "doors",
    "seats",
    "transmission",
    "cylinders",
    "price",
    "price2",
    "monthly-payment",
    "interior-features",
    "exterior-features",
    "safety-features",
    "features",
    "main-image",
    "drivetrain-features",
    "warranty-text",
    "certified",
    "special",
    "carproof",
    "drivetrain",
    "fueltype",
    "vehiclestatus",
    "modelcode",
    "videos",
    "description-2",
    "_draft",
    "_archived",
  ];

  let vehicle_temp = {};
  // set keys to lowercase and replace underscore with a dash (to match webflow naming)
  for (const key in vehicle)
    vehicle_temp[key.toLowerCase().replace("_", "-")] = vehicle[key];
  vehicle = vehicle_temp;
  // formatting description and renaming keys
  vehicle["description-2"] = he
    .decode(vehicle["description"])
    .replace(/&#39;/g, "'");
  vehicle["stock-number-2"] = vehicle["stock-number"];
  // add necessary webflow cms api keys
  vehicle["name"] = vehicle["vin"];
  vehicle["_archived"] = false;
  vehicle["_draft"] = false;
  vehicle["dealership-boost-id"] = vehicle["dealershipid"];
  vehicle_temp = {};

  // filter out the not-needed keys
  Object.entries(vehicle).forEach(([key, value]) => {
    if (key_list.includes(key)) {
      vehicle_temp[key] = value;
    }
  });
  vehicle = vehicle_temp;
  try {
    // If the vehicle exists, ignore it
    if (reuploadImages && !current_vehicle_names.includes(vehicle["name"])) {
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
    } else console.log("This item already exists in the Webflow CMS API");
    return vehicle;
  } catch (e) {
    console.log("Couldn't upload images ", e);
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
  const url = `https://api.webflow.com/sites/${siteId}/publish`;
  axios
    .post(url, domains, config)
    .then(async () => {
      console.log("Website Published Successfully!");
    })
    .catch((e) => console.log("Couldn't publish website, ", e));
  await cloudinary.v2.api.delete_all_resources();
  console.log("All cloud images deleted. Clean up completed");
};
// Will execute every day at midnight GMT-5
Cron("0 0 2 * * *", () => {
  console.log(
    "######################################## THE SCRIPT IS RUNNING THROUGH THE CRON JOB ########################################"
  );
  runScript();
});
