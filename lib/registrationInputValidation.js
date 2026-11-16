const EMOJI_PATTERN = /[\p{Extended_Pictographic}\uFE0F\u200D]/u;
const EMOTICON_PATTERN = /(?:<3|(?<![\p{L}\p{N}])(?:xD|XD)(?![\p{L}\p{N}])|\^[_.,-]?\^|>[:;][-']?[()DPp]|[:;][-']?[)(DPpOo3/\\|])/u;

const NAME_PATTERN = /^[\p{L}\p{M}0-9 '\u2019\u2018-]+$/u;
const EMAIL_PATTERN = /^[\p{L}\p{M}0-9@._+\-'\u2019\u2018]+$/u;
const PASSWORD_PATTERN = /^[\p{L}\p{M}0-9!@#$%^&*(),.?":{}|<>'\u2019\u2018]+$/u;

const FIELD_PATTERNS = {
  name: NAME_PATTERN,
  email: EMAIL_PATTERN,
  password: PASSWORD_PATTERN,
};

export function containsEmojiOrEmoticon(value) {
  return EMOJI_PATTERN.test(value) || EMOTICON_PATTERN.test(value);
}

export function getRegistrationCharacterError(field, value) {
  const text = String(value || '');
  if (!text) return '';

  if (containsEmojiOrEmoticon(text)) {
    return 'Emojis and emoticons are not allowed.';
  }

  const pattern = FIELD_PATTERNS[field];
  if (pattern && !pattern.test(text)) {
    return 'Special characters or symbols are not allowed.';
  }

  return '';
}
