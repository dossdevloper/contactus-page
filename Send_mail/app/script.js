// ---- EDIT THESE TWO VALUES ----
var APP_NAME  = "claims-management";
var FORM_NAME = "Conatct_Us";
// --------------------------------

// ---- EDIT THESE THREE VALUES to match your Organization report ----
var ORG_REPORT_NAME  = "Organization_Detail"; // <-- your actual report name
var ORG_EMAIL_FIELD  = "Email";               // <-- your actual field API name
var ORG_MOBILE_FIELD = "Mobile";              // <-- your actual field API name
// --------------------------------------------------------------------

ZOHO.CREATOR.init().then(function () {
  var submitBtn  = document.getElementById("cw-submit");
  var msgBox     = document.getElementById("cw-msg");
  var emailField = document.getElementById("cw-email");

  // --- Diagnostics / email auto-fill: isolated so a failure here
  //     can NEVER prevent the submit button from working. ---
  try {
    var initParamsResult = ZOHO.CREATOR.UTIL.getInitParams();

    if (initParamsResult && typeof initParamsResult.then === "function") {
      // Promise-based SDK
      initParamsResult.then(function (initParams) {
        console.log("[ContactWidget] initParams ->", initParams);
        applyLoginEmail(initParams);
      }).catch(function (err) {
        console.error("[ContactWidget] getInitParams promise failed:", err);
      });
    } else if (initParamsResult) {
      // Synchronous return
      console.log("[ContactWidget] initParams (sync) ->", initParamsResult);
      applyLoginEmail(initParamsResult);
    } else {
      console.warn("[ContactWidget] getInitParams returned nothing usable:", initParamsResult);
    }
  } catch (diagErr) {
    console.error("[ContactWidget] getInitParams threw:", diagErr);
  }

  function applyLoginEmail(initParams) {
    if (!initParams) return;
    var loginEmail = initParams.loginUser
                   ?? initParams.loginuser
                   ?? initParams.useremail
                   ?? "";
    if (loginEmail && emailField && !emailField.value) {
      emailField.value = loginEmail;
    }
  }
  // --- end diagnostics ---

  // --- Organization contact info (email/mobile): fetched dynamically from
  //     a Creator report. Fully isolated — a failure here can NEVER
  //     prevent the submit button from working, and it never touches
  //     the existing static text unless the fetch actually succeeds. ---
  try {
    var orgConfig = {
      appName: APP_NAME,
      reportName: ORG_REPORT_NAME,
      maxRecords: 1
    };

    ZOHO.CREATOR.API.getAllRecords(orgConfig).then(function (response) {
      console.log("[ContactWidget] org report response ->", response);

      if (!response || response.code !== 3000 || !response.data || !response.data.length) {
        console.warn("[ContactWidget] Organization report returned no usable records:", response);
        return;
      }

      var org        = response.data[0];
      var orgEmail   = org[ORG_EMAIL_FIELD];
      var orgMobile  = org[ORG_MOBILE_FIELD];

      var emailLink  = document.getElementById("cw-org-email");
      var mobileLink = document.getElementById("cw-org-mobile");

      if (orgEmail && emailLink) {
        emailLink.textContent = orgEmail;
        emailLink.setAttribute("href", "mailto:" + orgEmail);
      }

      if (orgMobile && mobileLink) {
        mobileLink.textContent = orgMobile;
        mobileLink.setAttribute("href", "tel:" + String(orgMobile).replace(/\s+/g, ""));
      }
    }).catch(function (err) {
      console.error("[ContactWidget] Failed to fetch organization details:", err);
    });
  } catch (orgErr) {
    console.error("[ContactWidget] Organization details fetch threw synchronously:", orgErr);
  }
  // --- end organization contact info ---

  // Button wiring now ALWAYS runs, regardless of the above.
  if (!submitBtn) {
    console.error("[ContactWidget] #cw-submit not found in DOM — check your HTML id.");
    return;
  }

  submitBtn.addEventListener("click", function () {
    var help       = document.querySelector('input[name="help"]:checked');
    var subject    = document.getElementById("cw-subject");
    var email      = document.getElementById("cw-email");
    var message    = document.getElementById("cw-message");
    var attachment = document.getElementById("cw-attachment");

    [subject, email, message].forEach(function (f) { f.classList.remove("cw-field-error"); });

    var valid = true;
    if (!help) { valid = false; }
    if (!subject.value.trim()) { subject.classList.add("cw-field-error"); valid = false; }
    if (!email.value.trim() || email.value.indexOf("@") === -1) { email.classList.add("cw-field-error"); valid = false; }
    if (!message.value.trim()) { message.classList.add("cw-field-error"); valid = false; }


    showMsg("", "");
    if (!valid) {
      showMsg("Please select a category, add a subject, enter your email, and add a message.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

   var config = {
  appName: APP_NAME,
  formName: FORM_NAME,
  data: {
    "data": {
      "how_can_we_help": help.value,
      "Subject_field1": subject.value.trim(),
      "From": email.value.trim(),
      "Messagee": message.value.trim(),
      "Has_Attachments": "false"
    }
  }
};

    console.log("[ContactWidget] submitting config ->", config);

    var timedOut = false;
    var safetyTimer = setTimeout(function () {
      timedOut = true;
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit inquiry";
      showMsg("This is taking too long. Check APP_NAME/FORM_NAME and the console (F12).", "error");
    }, 15000);

    function afterAddRecord(response) {
      if (timedOut) return;
      clearTimeout(safetyTimer);
      console.log("[ContactWidget] addRecord response ->", response);

      if (!response || response.code !== 3000) {
        finishWithError();
        console.error("addRecord error:", response);
        return;
      }

      var newRecordId = response.data.ID;

      if (!attachment.files || attachment.files.length === 0) {
        finishWithSuccess();
        return;
      }

      var uploadConfig = {
  appName: APP_NAME,
  reportName: "Contact_Us",
  id: newRecordId,
  fieldName: "Reference_File",
  file: attachment.files[0]
};

      ZOHO.CREATOR.API.uploadFile(uploadConfig).then(function (uploadResponse) {
    console.log("[ContactWidget] uploadFile response ->", uploadResponse);

    if (uploadResponse && (uploadResponse.code === 3000 || uploadResponse.code === "3000")) {

      // File uploaded successfully — now flip Has_Attachments to true
      var updateConfig = {
        appName: APP_NAME,
        reportName: "Contact_Us",
        id: newRecordId,
        data: {
          "data": {
            "Has_Attachments": "true"
          }
        }
      };

      ZOHO.CREATOR.API.updateRecord(updateConfig).then(function (updateResponse) {
        console.log("[ContactWidget] Has_Attachments updated ->", updateResponse);
        finishWithSuccess();
      }).catch(function (updateErr) {
        console.error("[ContactWidget] Failed to update Has_Attachments:", updateErr);
        finishWithSuccess(); // still succeed even if this side-update fails
      });

    } else {
      console.error("uploadFile error:", uploadResponse);
      finishWithSuccess("Inquiry sent, but the attachment could not be uploaded.");
    }
}).catch(function (err) {
    console.error("uploadFile failed:", err);
    finishWithSuccess("Inquiry sent, but the attachment could not be uploaded.");
});
    }

    function onAddRecordFailed(err) {
      if (timedOut) return;
      clearTimeout(safetyTimer);
      finishWithError();
      console.error("addRecord failed:", err);
    }

    try {
      ZOHO.CREATOR.API.addRecord(config).then(afterAddRecord).catch(onAddRecordFailed);
    } catch (syncErr) {
      clearTimeout(safetyTimer);
      finishWithError();
      console.error("addRecord threw synchronously:", syncErr);
    }

    function finishWithSuccess(customText) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit inquiry";
      showMsg(customText || "Thanks — your inquiry has been sent. We'll be in touch shortly.", "success");
      resetForm();
    }

    function finishWithError() {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit inquiry";
      showMsg("Something went wrong sending your inquiry. Please try again.", "error");
    }
  });

  function resetForm() {
    document.querySelectorAll('input[name="help"]').forEach(function (r) { r.checked = false; });
    document.getElementById("cw-subject").value = "";
    document.getElementById("cw-email").value = "";
    document.getElementById("cw-message").value = "";
    document.getElementById("cw-attachment").value = "";
  }

  function showMsg(text, type) {
    msgBox.textContent = text;
    msgBox.className = "cw-msg" + (type ? " " + type : "");
    msgBox.style.display = text ? "block" : "none";
  }
}).catch(function (err) {
  console.error("[ContactWidget] ZOHO.CREATOR.init failed:", err);
});