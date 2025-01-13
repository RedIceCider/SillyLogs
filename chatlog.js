import { getRequestHeaders } from "../../../../script.js";
import { extension_settings, getContext } from "../../../extensions.js";

const extensionName = "SillyLogs";
const extensionSettings = extension_settings[extensionName];
const userHash = extensionSettings?.userHash || "";
const useProxy = extensionSettings?.useProxy || false;
const headers = getRequestHeaders();

export async function createChatlog(startRange, endRange, forceUpload) {
  const context = getContext();
  const chat = context.chat;

  startRange = Math.max(0, startRange);
  endRange = Math.min(chat.length, endRange + 1);

  if (endRange < startRange) {
    [startRange, endRange] = [endRange, startRange];
  }

  const chatlog = {
    chat: [],
    "character_source": {},
    "image_mappings": {
      "system": {
        filename: "system",
        url: "system-avatar.png"
      }
    },
    version: 1
  };

  let characterAvatarFilename = null;

  // Handle character card source
  const character = context.characters[context.characterId];
  const chub_path = character.data.extensions.chub?.full_path || null;
  if (chub_path != null && forceUpload === false) {
    chatlog.character_source.type = "chub";
    chatlog.character_source.full_path = `https://chub.ai/${chub_path}`;

    // Get image from Chub (pls dont break in the future)
    characterAvatarFilename = `chub_${chub_path.replace('/', '_')}`;
    const chubAvatarUrl = `https://avatars.charhub.io/avatars/${chub_path}/chara_card_v2.png`;
    chatlog.image_mappings[characterAvatarFilename] = {
      filename: characterAvatarFilename,
      url: chubAvatarUrl
    };
  } else {
    chatlog.character_source.type = "catbox";
    const characterCardFilepath = "/characters/" + character.avatar;
    const characterCardUrl = await uploadToCatbox(characterCardFilepath, characterCardFilepath);
    chatlog.character_source.full_path = characterCardUrl;

    // Add character avatar to image_mappings
    characterAvatarFilename = character.avatar.split('/').pop();
    chatlog.image_mappings[characterAvatarFilename] = {
      filename: characterAvatarFilename,
      url: characterCardUrl
    };
  }

  // Helper function to add image to mappings and return the mapping key
  async function addImageMapping(localPath) {
    console.log("From addImageMapping: ", localPath);
    const filename = localPath.split('/').pop();
    if (!chatlog.image_mappings[filename]) {
      const url = await uploadToCatbox(localPath, filename);
      chatlog.image_mappings[filename] = { filename, url };
    }
    return `IMAGE_MAP:${filename}`;
  }

  // Create chatlog
  for (let i = startRange; i < endRange; i++) {
    const message = chat[i];
    const newMessage = {
      name: message.name,
      mes: message.mes,
      "is_user": message["is_user"],
      "is_system": message["is_system"],
      api: {
        source: message.extra?.api || null,
        model: message.extra?.model || null,
      }
    };

    // User messages
    if (message["is_user"] === true) {
      newMessage.avatar = await addImageMapping(`/${message["force_avatar"]}`);
    }
    // No, is_system does not give you all system messages
    else if (message["ch_name"] === "System" && message["is_user"] === false) {
      // System messages
      newMessage.avatar = "IMAGE_MAP:system"; // has a default URL
    }
    else {
      // AI messages, use the avatar from character_source
      newMessage.avatar = characterAvatarFilename ? `IMAGE_MAP:${characterAvatarFilename}` : null;
    }

    // Inline images
    if (message.extra?.image) {
      newMessage.image = await addImageMapping(message.extra.image);
    }

    chatlog.chat.push(newMessage);
  }

  return chatlog;
}

async function uploadToCatbox(filepath, filename) {
  if (useProxy) {
    return await uploadViaProxy(filepath, filename);
  } else {
    return await uploadViaPlugin(filepath, filename);
  }
}

async function uploadViaPlugin(filepath, filename) {
  try {
    const response = await fetch('/api/plugins/catbox/uploadFile', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filepath: filepath, userhash: userHash })
    });

    // console.log(response);
    const result = await response.text();
    console.log(`File ${filename} uploaded successfully:`, result);
    return result;
  } catch (err) {
    if (err.status === 401) {
      toastr.error("Unauthorized: Invalid user hash provided.");
    } else {
      toastr.error("Unknown error occured. Check the console for more info.");
    }
    console.error(`Failed to upload file ${filename}: ${err}`);
  }
}

// Does not work with Silly's CORS
// because Silly's CORS proxy cannot handle multiform data
// Using: https://allorigins.win/
async function uploadViaProxy(filepath, filename) {
  if (extensionSettings.corsProxy === "") {
    // toastr.error("CORS proxy URL is not set. Please set it in the extension settings.");
    return;
  }

  const fileData = await fetch(filepath);
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('userhash', userHash);
  formData.append('fileToUpload', await fileData.blob(), filename);

  const encodedUrl = encodeURIComponent('https://catbox.moe/user/api.php');
  const proxyUrl = extensionSettings.corsProxy.replace('{url}', encodedUrl);
  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'multipart/form-data'
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    // console.log(response);
    const result = await response.text();
    console.log(`File ${filename} uploaded successfully:`, result);
    return result;
  } catch (err) {
    if (err.status === 401) {
      toastr.error("Unauthorized: Invalid user hash provided.");
    } else {
      toastr.error("Unknown error occured. Check the console for more info.");
    }
    console.error(`Failed to upload file ${filename}: ${err}`);
  }
}

export async function uploadChatlog(chatlog) {
  console.log("Uploading JSON:", chatlog);
  try {
    if (useProxy) {
      return await uploadChatlogViaProxy(chatlog);
    } else {
      return await uploadChatlogViaPlugin(chatlog);
    }
  } catch (e) {
    console.error("Error uploading chatlog JSON:", e);
  }
}

async function uploadChatlogViaPlugin(chatlog) {
  const response = await fetch('/api/plugins/catbox/uploadJson', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ chatlog: chatlog, userhash: userHash })
  });
  const result = await response.text();
  console.log("Uploaded JSON file: ", result);
  return result;
}

async function uploadChatlogViaProxy(chatlog) {
  if (extensionSettings.corsProxy === "") {
    // toastr.error("CORS proxy URL is not set. Please set it in the extension settings.");
    return;
  }

  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('userhash', userHash);
  formData.append('fileToUpload', new Blob([JSON.stringify(chatlog)], { type: 'application/json' }), 'chatlog.json');

  const encodedUrl = encodeURIComponent('https://catbox.moe/user/api.php');
  const proxyUrl = extensionSettings.corsProxy.replace('{url}', encodedUrl);

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'multipart/form-data'
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = await response.text();
  console.log("Uploaded JSON file: ", result);
  return result;
}