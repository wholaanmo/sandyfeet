import {
  getProvinces,
  getProvince,
  getCities,
  getCity,
  getBarangays,
  getBarangay,
} from 'ph-addresses-location';

const normalizeName = (value) => String(value || '').trim().toLowerCase();

export const getProvinceOptions = () =>
  getProvinces().sort((a, b) => a.name.localeCompare(b.name));

export const getCityOptionsForProvince = (provinceCode) => {
  if (!provinceCode) return [];
  return getCities(provinceCode).sort((a, b) => a.name.localeCompare(b.name));
};

export const getBarangayOptionsForCity = (cityCode) => {
  if (!cityCode) return [];
  return getBarangays(cityCode).sort((a, b) => a.name.localeCompare(b.name));
};

export const resolveAddressCodesFromNames = (address = {}) => {
  const provinceName = normalizeName(address.province);
  const cityName = normalizeName(address.city || address.cityMunicipality);
  const barangayName = normalizeName(address.barangay);

  const provinceMatch = getProvinceOptions().find(
    (item) => normalizeName(item.name) === provinceName
  );

  const cityMatch = provinceMatch
    ? getCityOptionsForProvince(provinceMatch.code).find(
        (item) => normalizeName(item.name) === cityName
      )
    : null;

  const barangayMatch = cityMatch
    ? getBarangayOptionsForCity(cityMatch.code).find(
        (item) => normalizeName(item.name) === barangayName
      )
    : null;

  return {
    provinceCode: provinceMatch?.code || '',
    cityCode: cityMatch?.code || '',
    barangayCode: barangayMatch?.code || '',
  };
};

export const getAddressNamesFromCodes = ({ provinceCode, cityCode, barangayCode }) => ({
  province: provinceCode ? getProvince(provinceCode)?.name || '' : '',
  city: cityCode ? getCity(cityCode)?.name || '' : '',
  barangay: barangayCode ? getBarangay(barangayCode)?.name || '' : '',
});
