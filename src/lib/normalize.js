function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function toTitleCase(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const CITY_NAME_REGEX = /^[a-zA-Z\s'-]{2,50}$/;

module.exports = { normalizeEmail, toTitleCase, CITY_NAME_REGEX };
