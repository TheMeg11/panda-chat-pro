import { describe, expect, it } from "vitest";
import { dictionaries, dirFor, errorText, tr, type Lang } from "@/lib/i18n";

/**
 * i18n contract: both dictionaries must expose the SAME key tree (type-checked
 * at compile time) and every key used by the new features must resolve.
 */
const KEYS_TO_CHECK = [
  "tutorial.title",
  "tutorial.prev",
  "tutorial.next",
  "tutorial.skip",
  "tutorial.finish",
  "tutorial.replay",
  "tutorial.steps.chatList",
  "tutorial.steps.search",
  "tutorial.steps.newChat",
  "tutorial.steps.sendMessage",
  "tutorial.steps.rooms",
  "tutorial.steps.online",
  "tutorial.steps.vault",
  "tutorial.steps.security",
  "twofactor.title",
  "twofactor.start",
  "twofactor.recoveryTitle",
  "twofactor.loginTitle",
  "e2ee.title",
  "e2ee.enable",
  "e2ee.unlock",
  "e2ee.waiting",
  "selfdestruct.title",
  "selfdestruct.oneHour",
  "selfdestruct.oneDay",
  "selfdestruct.oneWeek",
  "security.vaultTitle",
  "security.decoyPin",
  "security.panic",
  "security.watermark",
  "security.revokeSession",
  "chat.decrypting",
  "dm.chatSettings",
  "auth.resetTitle",
  "auth.resetSubtitle",
  "auth.resetSent",
  "auth.resetCode",
  "auth.resetNewPassword",
  "auth.resetSubmit",
  "auth.resetConfirmSubmit",
  "auth.resetDone",
  "account.bio",
  "account.avatar",
  "account.avatarSaved",
  "account.avatarRemoved",
  "account.tgOfflineNotify",
  "account.tgOfflineNotifyHint",
  "account.tgOfflineNotifyOn",
  "account.tgOfflineNotifyOff",
];

describe("i18n dictionaries (fa/en parity for new features)", () => {
  it("supports exactly en + fa", () => {
    expect(Object.keys(dictionaries).sort()).toEqual(["en", "fa"]);
  });

  for (const lang of ["en", "fa"] as Lang[]) {
    it(`resolves every new key in ${lang}`, () => {
      const dict = dictionaries[lang];
      for (const key of KEYS_TO_CHECK) {
        const value = tr(dict, key);
        expect(value, `${lang}:${key} must resolve`).not.toBe(key);
        expect(value.length).toBeGreaterThan(0);
      }
    });

    it(`resolves every new error code in ${lang}`, () => {
      const dict = dictionaries[lang];
      const codes = [
        "invalid2faCode",
        "preAuthExpired",
        "e2eeRequired",
        "e2eeInvalidKey",
        "e2eePeerNotReady",
        "e2eeUnlockFailed",
        "featureDisabled",
        "badRequest",
        "bioTooLong",
        "avatarInvalid",
        "avatarTooSmall",
        "gifUnsupported",
        "resetCodeInvalid",
      ];
      for (const code of codes) {
        expect(errorText(dict, code), `${lang} error ${code}`).not.toBe(dict.errors.generic);
      }
    });
  }

  it("fa is RTL and en is LTR", () => {
    expect(dirFor("fa")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
  });
});
