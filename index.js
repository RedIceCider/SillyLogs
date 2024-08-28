import { saveSettingsDebounced } from "../../../../script.js";
import { callGenericPopup, POPUP_TYPE } from "../../../popup.js";
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { createChatlog, uploadChatlog } from "./chatlog.js";

const extensionName = "SillyLogs";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {
  "userHash": "",
  "useProxy": true,
  "corsProxy": ""
};

async function loadSettings() {
  try {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    console.log(extension_settings[extensionName]);
    if (Object.keys(extension_settings[extensionName]).length === 0) {
      Object.assign(extension_settings[extensionName], defaultSettings);
    }
    $("#user_hash").val(extension_settings[extensionName].userHash).trigger("input");
    $("#cors_proxy_url").val(extension_settings[extensionName].corsProxy).trigger("input");
    $('#use_proxy_checkbox').prop('checked', extension_settings[extensionName].useProxy);
  } catch (error) {
    console.error("SillyLogs: Error loading settings:", error);
    toastr.error("Failed to load SillyLogs settings. Check console for details.");
  }
}

function saveSettings() {
  try {
    const userHash = $('#user_hash').val();
    const useProxy = $('#use_proxy_checkbox').is(':checked');
    const corsProxy = $('#cors_proxy_url').val();

    if (useProxy && corsProxy === "") {
      toastr.warning("CORS Proxy URL is required when using proxy. Settings not saved.");
      return;
    }

    extensionSettings.userHash = userHash;
    extensionSettings.useProxy = useProxy;
    extensionSettings.corsProxy = corsProxy;
    console.log("SillyLogs: Saved settings.", extensionSettings);
    saveSettingsDebounced();
    toastr.success("Settings saved successfully.");
  } catch (error) {
    console.error("SillyLogs: Error saving settings:", error);
    toastr.error("Failed to save settings. Check console for details.");
  }
}

async function openLogMenu() {
  try {
    const logMenuHtml = await $.get(`${extensionFolderPath}/log_menu_dialog.html`);
    const dialog = $(logMenuHtml);
    dialog.find('#share_log_button').on('click', async () => {
      try {
        const rangeInput = String(dialog.find('#message_range_input').val());
        const [startRange, endRange] = rangeInput.split('-').map(num => parseInt(num.trim()));

        if (isNaN(startRange) || isNaN(endRange)) {
          throw new Error("Invalid range input");
        }

        const forceUpload = dialog.find('#force_upload_checkbox').is(':checked');
        dialog.find('#share_log_button').text('Uploading...');
        const chatlog = await createChatlog(startRange, endRange, forceUpload);
        await shareLog(chatlog);
      } catch (error) {
        console.error("SillyLogs: Error creating or sharing log:", error);
        toastr.error("Failed to create or share log. Check console for details.");
        dialog.find('#share_log_button').html('<i class="fa-solid fa-share margin-r5"></i>Share Log');
      }
    });

    $('#dialogue_popup').addClass('wide_dialogue_popup');
    callGenericPopup(dialog, POPUP_TYPE.TEXT, '', { wide: false, large: false, wider: false, okButton: 'Cancel' });
  } catch (error) {
    console.error("SillyLogs: Error opening log menu:", error);
    toastr.error("Failed to open log menu. Check console for details.");
  }
}

async function shareLog(chatlog) {
  try {
    console.log(chatlog);
    const chatlogURL = await uploadChatlog(chatlog);
    if (!chatlogURL) {
      throw new Error("Failed to get chatlog URL");
    }
    const resultHtml = await $.get(`${extensionFolderPath}/result_dialog.html`);
    const dialog = $(resultHtml);
    dialog.find('#log_url').attr('href', chatlogURL).text(chatlogURL);
    const spritesURL = `https://sprites.neocities.org/logs/reader?log=${encodeURIComponent(chatlogURL)}`;
    dialog.find('#sprites_url').attr('href', spritesURL).text('View on Sprites');
    callGenericPopup(dialog, POPUP_TYPE.TEXT, '', { wide: false, large: false, wider: false, okButton: 'Close' });
    $('#share_log_button').html('<i class="fa-solid fa-share margin-r5"></i>Share Log');
  } catch (error) {
    console.error("SillyLogs: Error sharing log:", error);
    toastr.error("Failed to share log. Check console for details.");
  }
}

jQuery(async () => {
  try {
    await loadSettings();
    const settingsHtml = await $.get(`${extensionFolderPath}/extension_settings.html`);
    $("#extensions_settings").append(settingsHtml);
    $("#save_user_hash").on("click", saveSettings);
    const logButtonHtml = await $.get(`${extensionFolderPath}/log_button.html`);
    $("#extensionsMenu").append(logButtonHtml);
    const logButton = $('#log_extension');
    logButton.on('click', openLogMenu);
  } catch (error) {
    console.error("SillyLogs: Error initializing extension:", error);
    toastr.error("Failed to initialize SillyLogs extension. Check console for details.");
  }
});
