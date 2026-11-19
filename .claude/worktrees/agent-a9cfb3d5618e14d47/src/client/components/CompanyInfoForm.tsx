import React, { useState } from "react";
import { useTranslation } from "../i18n"; // [SCOPE 052]

/**
 * Company information form component
 * Collects: company name, billing email, address, country, phone
 */

// Full ISO 3166-1 alpha-2 country list (English short names), alphabetical.
// The billingCountry field is validated as any /^[A-Z]{2}$/ code — there is no
// server-side whitelist — so the dropdown is the only gatekeeper; it must be
// complete. Default selection stays "US" regardless of list position.
const COUNTRIES: { code: string; name: string }[] = [
  { code: "AF", name: "Afghanistan" },
  { code: "AX", name: "Åland Islands" },
  { code: "AL", name: "Albania" },
  { code: "DZ", name: "Algeria" },
  { code: "AS", name: "American Samoa" },
  { code: "AD", name: "Andorra" },
  { code: "AO", name: "Angola" },
  { code: "AI", name: "Anguilla" },
  { code: "AQ", name: "Antarctica" },
  { code: "AG", name: "Antigua and Barbuda" },
  { code: "AR", name: "Argentina" },
  { code: "AM", name: "Armenia" },
  { code: "AW", name: "Aruba" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "AZ", name: "Azerbaijan" },
  { code: "BS", name: "Bahamas" },
  { code: "BH", name: "Bahrain" },
  { code: "BD", name: "Bangladesh" },
  { code: "BB", name: "Barbados" },
  { code: "BY", name: "Belarus" },
  { code: "BE", name: "Belgium" },
  { code: "BZ", name: "Belize" },
  { code: "BJ", name: "Benin" },
  { code: "BM", name: "Bermuda" },
  { code: "BT", name: "Bhutan" },
  { code: "BO", name: "Bolivia" },
  { code: "BQ", name: "Bonaire, Sint Eustatius and Saba" },
  { code: "BA", name: "Bosnia and Herzegovina" },
  { code: "BW", name: "Botswana" },
  { code: "BV", name: "Bouvet Island" },
  { code: "BR", name: "Brazil" },
  { code: "IO", name: "British Indian Ocean Territory" },
  { code: "BN", name: "Brunei Darussalam" },
  { code: "BG", name: "Bulgaria" },
  { code: "BF", name: "Burkina Faso" },
  { code: "BI", name: "Burundi" },
  { code: "CV", name: "Cabo Verde" },
  { code: "KH", name: "Cambodia" },
  { code: "CM", name: "Cameroon" },
  { code: "CA", name: "Canada" },
  { code: "KY", name: "Cayman Islands" },
  { code: "CF", name: "Central African Republic" },
  { code: "TD", name: "Chad" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CX", name: "Christmas Island" },
  { code: "CC", name: "Cocos (Keeling) Islands" },
  { code: "CO", name: "Colombia" },
  { code: "KM", name: "Comoros" },
  { code: "CG", name: "Congo" },
  { code: "CD", name: "Congo, Democratic Republic of the" },
  { code: "CK", name: "Cook Islands" },
  { code: "CR", name: "Costa Rica" },
  { code: "CI", name: "Côte d'Ivoire" },
  { code: "HR", name: "Croatia" },
  { code: "CU", name: "Cuba" },
  { code: "CW", name: "Curaçao" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" },
  { code: "DJ", name: "Djibouti" },
  { code: "DM", name: "Dominica" },
  { code: "DO", name: "Dominican Republic" },
  { code: "EC", name: "Ecuador" },
  { code: "EG", name: "Egypt" },
  { code: "SV", name: "El Salvador" },
  { code: "GQ", name: "Equatorial Guinea" },
  { code: "ER", name: "Eritrea" },
  { code: "EE", name: "Estonia" },
  { code: "SZ", name: "Eswatini" },
  { code: "ET", name: "Ethiopia" },
  { code: "FK", name: "Falkland Islands (Malvinas)" },
  { code: "FO", name: "Faroe Islands" },
  { code: "FJ", name: "Fiji" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GF", name: "French Guiana" },
  { code: "PF", name: "French Polynesia" },
  { code: "TF", name: "French Southern Territories" },
  { code: "GA", name: "Gabon" },
  { code: "GM", name: "Gambia" },
  { code: "GE", name: "Georgia" },
  { code: "DE", name: "Germany" },
  { code: "GH", name: "Ghana" },
  { code: "GI", name: "Gibraltar" },
  { code: "GR", name: "Greece" },
  { code: "GL", name: "Greenland" },
  { code: "GD", name: "Grenada" },
  { code: "GP", name: "Guadeloupe" },
  { code: "GU", name: "Guam" },
  { code: "GT", name: "Guatemala" },
  { code: "GG", name: "Guernsey" },
  { code: "GN", name: "Guinea" },
  { code: "GW", name: "Guinea-Bissau" },
  { code: "GY", name: "Guyana" },
  { code: "HT", name: "Haiti" },
  { code: "HM", name: "Heard Island and McDonald Islands" },
  { code: "VA", name: "Holy See" },
  { code: "HN", name: "Honduras" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IR", name: "Iran" },
  { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" },
  { code: "IM", name: "Isle of Man" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JM", name: "Jamaica" },
  { code: "JP", name: "Japan" },
  { code: "JE", name: "Jersey" },
  { code: "JO", name: "Jordan" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "KE", name: "Kenya" },
  { code: "KI", name: "Kiribati" },
  { code: "KP", name: "Korea, Democratic People's Republic of" },
  { code: "KR", name: "Korea, Republic of" },
  { code: "KW", name: "Kuwait" },
  { code: "KG", name: "Kyrgyzstan" },
  { code: "LA", name: "Lao People's Democratic Republic" },
  { code: "LV", name: "Latvia" },
  { code: "LB", name: "Lebanon" },
  { code: "LS", name: "Lesotho" },
  { code: "LR", name: "Liberia" },
  { code: "LY", name: "Libya" },
  { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MO", name: "Macao" },
  { code: "MG", name: "Madagascar" },
  { code: "MW", name: "Malawi" },
  { code: "MY", name: "Malaysia" },
  { code: "MV", name: "Maldives" },
  { code: "ML", name: "Mali" },
  { code: "MT", name: "Malta" },
  { code: "MH", name: "Marshall Islands" },
  { code: "MQ", name: "Martinique" },
  { code: "MR", name: "Mauritania" },
  { code: "MU", name: "Mauritius" },
  { code: "YT", name: "Mayotte" },
  { code: "MX", name: "Mexico" },
  { code: "FM", name: "Micronesia" },
  { code: "MD", name: "Moldova" },
  { code: "MC", name: "Monaco" },
  { code: "MN", name: "Mongolia" },
  { code: "ME", name: "Montenegro" },
  { code: "MS", name: "Montserrat" },
  { code: "MA", name: "Morocco" },
  { code: "MZ", name: "Mozambique" },
  { code: "MM", name: "Myanmar" },
  { code: "NA", name: "Namibia" },
  { code: "NR", name: "Nauru" },
  { code: "NP", name: "Nepal" },
  { code: "NL", name: "Netherlands" },
  { code: "NC", name: "New Caledonia" },
  { code: "NZ", name: "New Zealand" },
  { code: "NI", name: "Nicaragua" },
  { code: "NE", name: "Niger" },
  { code: "NG", name: "Nigeria" },
  { code: "NU", name: "Niue" },
  { code: "NF", name: "Norfolk Island" },
  { code: "MK", name: "North Macedonia" },
  { code: "MP", name: "Northern Mariana Islands" },
  { code: "NO", name: "Norway" },
  { code: "OM", name: "Oman" },
  { code: "PK", name: "Pakistan" },
  { code: "PW", name: "Palau" },
  { code: "PS", name: "Palestine, State of" },
  { code: "PA", name: "Panama" },
  { code: "PG", name: "Papua New Guinea" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PN", name: "Pitcairn" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "PR", name: "Puerto Rico" },
  { code: "QA", name: "Qatar" },
  { code: "RE", name: "Réunion" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russian Federation" },
  { code: "RW", name: "Rwanda" },
  { code: "BL", name: "Saint Barthélemy" },
  { code: "SH", name: "Saint Helena, Ascension and Tristan da Cunha" },
  { code: "KN", name: "Saint Kitts and Nevis" },
  { code: "LC", name: "Saint Lucia" },
  { code: "MF", name: "Saint Martin (French part)" },
  { code: "PM", name: "Saint Pierre and Miquelon" },
  { code: "VC", name: "Saint Vincent and the Grenadines" },
  { code: "WS", name: "Samoa" },
  { code: "SM", name: "San Marino" },
  { code: "ST", name: "Sao Tome and Principe" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SN", name: "Senegal" },
  { code: "RS", name: "Serbia" },
  { code: "SC", name: "Seychelles" },
  { code: "SL", name: "Sierra Leone" },
  { code: "SG", name: "Singapore" },
  { code: "SX", name: "Sint Maarten (Dutch part)" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "SB", name: "Solomon Islands" },
  { code: "SO", name: "Somalia" },
  { code: "ZA", name: "South Africa" },
  { code: "GS", name: "South Georgia and the South Sandwich Islands" },
  { code: "SS", name: "South Sudan" },
  { code: "ES", name: "Spain" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SD", name: "Sudan" },
  { code: "SR", name: "Suriname" },
  { code: "SJ", name: "Svalbard and Jan Mayen" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "SY", name: "Syrian Arab Republic" },
  { code: "TW", name: "Taiwan" },
  { code: "TJ", name: "Tajikistan" },
  { code: "TZ", name: "Tanzania" },
  { code: "TH", name: "Thailand" },
  { code: "TL", name: "Timor-Leste" },
  { code: "TG", name: "Togo" },
  { code: "TK", name: "Tokelau" },
  { code: "TO", name: "Tonga" },
  { code: "TT", name: "Trinidad and Tobago" },
  { code: "TN", name: "Tunisia" },
  { code: "TR", name: "Türkiye" },
  { code: "TM", name: "Turkmenistan" },
  { code: "TC", name: "Turks and Caicos Islands" },
  { code: "TV", name: "Tuvalu" },
  { code: "UG", name: "Uganda" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "UM", name: "United States Minor Outlying Islands" },
  { code: "UY", name: "Uruguay" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "VU", name: "Vanuatu" },
  { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Viet Nam" },
  { code: "VG", name: "Virgin Islands (British)" },
  { code: "VI", name: "Virgin Islands (U.S.)" },
  { code: "WF", name: "Wallis and Futuna" },
  { code: "EH", name: "Western Sahara" },
  { code: "YE", name: "Yemen" },
  { code: "ZM", name: "Zambia" },
  { code: "ZW", name: "Zimbabwe" },
];

interface CompanyInfoFormProps {
  onNext: (data: {
    companyName: string;
    billingEmail: string;
    billingAddress: string;
    billingCountry: string;
    billingPhone: string;
    referredBy: string; // [SCOPE 088 / T005] optional distributor referral code
  }) => void;
  initialData?: {
    companyName?: string;
    billingEmail?: string;
    billingAddress?: string;
    billingCountry?: string;
    billingPhone?: string;
    referredBy?: string; // [SCOPE 088 / T005]
  };
}

const CompanyInfoForm: React.FC<CompanyInfoFormProps> = ({
  onNext,
  initialData,
}) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    companyName: initialData?.companyName || "",
    billingEmail: initialData?.billingEmail || "",
    billingAddress: initialData?.billingAddress || "",
    billingCountry: initialData?.billingCountry || "US",
    billingPhone: initialData?.billingPhone || "",
    referredBy: initialData?.referredBy || "", // [SCOPE 088 / T005]
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Company name validation
    if (!formData.companyName.trim()) {
      newErrors.companyName = t("register.errCompanyNameRequired");
    } else if (formData.companyName.length < 2) {
      newErrors.companyName = t("register.errCompanyNameMin");
    } else if (formData.companyName.length > 255) {
      newErrors.companyName = t("register.errCompanyNameMax");
    }

    // Billing email validation
    if (!formData.billingEmail.trim()) {
      newErrors.billingEmail = t("register.errBillingEmailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.billingEmail)) {
      newErrors.billingEmail = t("register.errEmailInvalid");
    }

    // Billing address validation
    if (!formData.billingAddress.trim()) {
      newErrors.billingAddress = t("register.errBillingAddressRequired");
    } else if (formData.billingAddress.length < 10) {
      newErrors.billingAddress = t("register.errBillingAddressMin");
    } else if (formData.billingAddress.length > 500) {
      newErrors.billingAddress = t("register.errBillingAddressMax");
    }

    // Country validation
    if (!formData.billingCountry.trim()) {
      newErrors.billingCountry = t("register.errCountryRequired");
    } else if (!/^[A-Z]{2}$/.test(formData.billingCountry)) {
      newErrors.billingCountry = t("register.errCountryInvalid");
    }

    // Phone validation
    if (!formData.billingPhone.trim()) {
      newErrors.billingPhone = t("register.errPhoneRequired");
    } else if (formData.billingPhone.length < 10) {
      newErrors.billingPhone = t("register.errPhoneMin");
    } else if (formData.billingPhone.length > 20) {
      newErrors.billingPhone = t("register.errPhoneMax");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      onNext(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputBase = "w-full px-4 py-2 border rounded-lg transition focus:outline-none focus:ring-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500";
  const inputNormal = `${inputBase} border-slate-300 dark:border-slate-600 focus:ring-blue-500`;
  const inputError = `${inputBase} border-red-500 focus:ring-red-500`;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("register.companyTitle")}</h2>
      <p className="text-slate-600 dark:text-slate-400">
        {t("register.companySubtitle")}
      </p>

      {/* Company Name */}
      <div>
        <label htmlFor="companyName" className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
          {t("register.companyNameLabel")}
        </label>
        <input
          id="companyName"
          name="companyName"
          type="text"
          value={formData.companyName}
          onChange={handleChange}
          placeholder="Acme Corporation"
          className={errors.companyName ? inputError : inputNormal}
        />
        {errors.companyName && (
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">{errors.companyName}</p>
        )}
      </div>

      {/* Billing Email */}
      <div>
        <label htmlFor="billingEmail" className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
          {t("register.billingEmailLabel")}
        </label>
        <input
          id="billingEmail"
          name="billingEmail"
          type="email"
          value={formData.billingEmail}
          onChange={handleChange}
          placeholder="billing@acme.com"
          className={errors.billingEmail ? inputError : inputNormal}
        />
        {errors.billingEmail && (
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">{errors.billingEmail}</p>
        )}
      </div>

      {/* Billing Address */}
      <div>
        <label htmlFor="billingAddress" className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
          {t("register.billingAddressLabel")}
        </label>
        <textarea
          id="billingAddress"
          name="billingAddress"
          value={formData.billingAddress}
          onChange={handleChange}
          placeholder="123 Main Street&#10;Anytown, ST 12345&#10;USA"
          rows={3}
          className={`${errors.billingAddress ? inputError : inputNormal} resize-none`}
        />
        {errors.billingAddress && (
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">{errors.billingAddress}</p>
        )}
      </div>

      {/* Country */}
      <div>
        <label htmlFor="billingCountry" className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
          {t("register.countryLabel")}
        </label>
        <select
          id="billingCountry"
          name="billingCountry"
          value={formData.billingCountry}
          onChange={handleChange}
          className={errors.billingCountry ? inputError : inputNormal}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.billingCountry && (
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">{errors.billingCountry}</p>
        )}
      </div>

      {/* Phone */}
      <div>
        <label htmlFor="billingPhone" className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
          {t("register.phoneLabel")}
        </label>
        <input
          id="billingPhone"
          name="billingPhone"
          type="tel"
          value={formData.billingPhone}
          onChange={handleChange}
          placeholder="+1 (555) 123-4567"
          className={errors.billingPhone ? inputError : inputNormal}
        />
        {errors.billingPhone && (
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">{errors.billingPhone}</p>
        )}
      </div>

      {/* [SCOPE 088 / T005] Referred by (optional distributor referral code) */}
      <div>
        <label htmlFor="referredBy" className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
          {t("register.referredByLabel")}
        </label>
        <input
          id="referredBy"
          name="referredBy"
          type="text"
          value={formData.referredBy}
          onChange={handleChange}
          placeholder="e.g. WX7K2Q"
          autoCapitalize="characters"
          className={`${inputNormal} uppercase placeholder:normal-case`}
        />
        <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
          {t("register.referredByHint")}
        </p>
      </div>

      {/* Submit button */}
      <div className="flex justify-end pt-6">
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2 px-8 rounded-lg transition duration-200"
        >
          {isSubmitting ? t("register.loading") : t("register.next")}
        </button>
      </div>
    </form>
  );
};

export default CompanyInfoForm;
