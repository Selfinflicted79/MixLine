const WIZARD_KEY = "mixline.wizard.done";

export function hasFinishedWizard() {
  try {
    return localStorage.getItem(WIZARD_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWizardFinished() {
  try {
    localStorage.setItem(WIZARD_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function resetWizard() {
  try {
    localStorage.removeItem(WIZARD_KEY);
  } catch {
    /* ignore */
  }
}
