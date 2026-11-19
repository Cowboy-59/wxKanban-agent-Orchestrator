import React, { useState } from "react";
import { useTranslation } from "../i18n"; // [SCOPE 052]

/**
 * Admin account creation form component
 * Collects: email, password, first name, last name
 * Validates password strength
 */

interface AdminAccountFormProps {
  onSubmit: (data: {
    adminEmail: string;
    adminPassword: string;
    adminFirstName: string;
    adminLastName?: string;
    newsletterOptIn: boolean; // [SCOPE 064 / T010] Amendment A
  }) => void;
  onBack: () => void;
  isLoading?: boolean;
  initialData?: {
    adminEmail?: string;
    adminFirstName?: string;
    adminLastName?: string;
    billingEmail?: string;
  };
}

interface PasswordRequirement {
  id: string;
  label: string;
  regex: RegExp;
  met: boolean;
}

const AdminAccountForm: React.FC<AdminAccountFormProps> = ({
  onSubmit,
  onBack,
  isLoading = false,
  initialData,
}) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    adminEmail: initialData?.adminEmail || initialData?.billingEmail || "",
    adminPassword: "",
    adminFirstName: initialData?.adminFirstName || "",
    adminLastName: initialData?.adminLastName || "",
    newsletterOptIn: true, // [SCOPE 064 / T010] Amendment A — opted-in by default
  });

  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Password requirements
  const passwordRequirements: PasswordRequirement[] = [
    {
      id: "length",
      label: t("register.pwReqLength"),
      regex: /.{12,}/,
      met: formData.adminPassword.length >= 12,
    },
    {
      id: "uppercase",
      label: t("register.pwReqUpper"),
      regex: /[A-Z]/,
      met: /[A-Z]/.test(formData.adminPassword),
    },
    {
      id: "lowercase",
      label: t("register.pwReqLower"),
      regex: /[a-z]/,
      met: /[a-z]/.test(formData.adminPassword),
    },
    {
      id: "number",
      label: t("register.pwReqNumber"),
      regex: /\d/,
      met: /\d/.test(formData.adminPassword),
    },
    {
      id: "special",
      label: t("register.pwReqSpecial"),
      regex: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\\/?]/,
      met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\\/?]/.test(formData.adminPassword),
    },
  ];

  const isPasswordValid = passwordRequirements.every((req) => req.met);

  // Gate the Complete button on the step's required fields: valid email, a first
  // name, and a password meeting every rule. (Company is captured/validated in the
  // prior step, so it is guaranteed present by the time this form renders.)
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.adminEmail.trim());
  const trimmedFirstName = formData.adminFirstName.trim();
  const isFirstNameValid = trimmedFirstName.length >= 1 && trimmedFirstName.length <= 100;
  const isFormValid = isEmailValid && isFirstNameValid && isPasswordValid;

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Email validation
    if (!formData.adminEmail.trim()) {
      newErrors.adminEmail = t("register.errEmailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.adminEmail)) {
      newErrors.adminEmail = t("register.errEmailInvalid");
    }

    // Password validation
    if (!formData.adminPassword) {
      newErrors.adminPassword = t("register.errPasswordRequired");
    } else if (!isPasswordValid) {
      newErrors.adminPassword = t("register.errPasswordRequirements");
    }

    // First name validation
    if (!formData.adminFirstName.trim()) {
      newErrors.adminFirstName = t("register.errFirstNameRequired");
    } else if (formData.adminFirstName.length < 1 || formData.adminFirstName.length > 100) {
      newErrors.adminFirstName = t("register.errFirstNameLength");
    }

    // Last name validation (optional)
    if (
      formData.adminLastName &&
      (formData.adminLastName.length < 1 || formData.adminLastName.length > 100)
    ) {
      newErrors.adminLastName = t("register.errLastNameLength");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    onSubmit(formData);
  };

  const inputBase = "w-full px-4 py-2 border rounded-lg transition focus:outline-none focus:ring-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500";
  const inputNormal = `${inputBase} border-slate-300 dark:border-slate-600 focus:ring-blue-500`;
  const inputError = `${inputBase} border-red-500 focus:ring-red-500`;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("register.adminTitle")}</h2>
      <p className="text-slate-600 dark:text-slate-400">
        {t("register.adminSubtitle")}
      </p>

      {/* Email */}
      <div>
        <label htmlFor="adminEmail" className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
          {t("register.emailLabel")}
        </label>
        <input
          id="adminEmail"
          name="adminEmail"
          type="email"
          value={formData.adminEmail}
          onChange={handleChange}
          placeholder="admin@company.com"
          className={errors.adminEmail ? inputError : inputNormal}
        />
        {errors.adminEmail && (
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">{errors.adminEmail}</p>
        )}
      </div>

      {/* First Name */}
      <div>
        <label htmlFor="adminFirstName" className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
          {t("register.firstNameLabel")}
        </label>
        <input
          id="adminFirstName"
          name="adminFirstName"
          type="text"
          value={formData.adminFirstName}
          onChange={handleChange}
          placeholder="John"
          className={errors.adminFirstName ? inputError : inputNormal}
        />
        {errors.adminFirstName && (
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">{errors.adminFirstName}</p>
        )}
      </div>

      {/* Last Name */}
      <div>
        <label htmlFor="adminLastName" className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
          {t("register.lastNameLabel")}
        </label>
        <input
          id="adminLastName"
          name="adminLastName"
          type="text"
          value={formData.adminLastName}
          onChange={handleChange}
          placeholder="Doe"
          className={errors.adminLastName ? inputError : inputNormal}
        />
        {errors.adminLastName && (
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">{errors.adminLastName}</p>
        )}
      </div>

      {/* Password */}
      <div>
        <label htmlFor="adminPassword" className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
          {t("register.passwordLabel")}
        </label>
        <div className="relative">
          <input
            id="adminPassword"
            name="adminPassword"
            type={showPassword ? "text" : "password"}
            value={formData.adminPassword}
            onChange={handleChange}
            placeholder="••••••••••••"
            className={`${errors.adminPassword ? inputError : inputNormal} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path
                  fillRule="evenodd"
                  d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-14-14zM10 4.5a6.5 6.5 0 016.481 5.043l1.396 1.396A8 8 0 002.66 10.06l1.396-1.396A6.5 6.5 0 0110 4.5z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
        </div>
        {errors.adminPassword && (
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">{errors.adminPassword}</p>
        )}

        {/* Password requirements */}
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{t("register.pwReqTitle")}</p>
          {passwordRequirements.map((req) => (
            <div key={req.id} className="flex items-center text-xs">
              <svg
                className={`w-4 h-4 mr-2 flex-shrink-0 ${
                  req.met ? "text-green-600 dark:text-green-400" : "text-slate-300 dark:text-slate-600"
                }`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span className={req.met ? "text-slate-700 dark:text-slate-300" : "text-slate-500 dark:text-slate-500"}>
                {req.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* [SCOPE 064 / T010] Amendment A — newsletter opt-in (pre-checked, opt-out at will). */}
      <div className="flex items-start gap-3">
        <input
          id="newsletterOptIn"
          type="checkbox"
          checked={formData.newsletterOptIn}
          onChange={(e) => setFormData((prev) => ({ ...prev, newsletterOptIn: e.target.checked }))}
          className="w-4 h-4 mt-0.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="newsletterOptIn" className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
          Keep me posted on product updates and occasional offers. You can change this anytime in Settings.
        </label>
      </div>

      {/* Terms acceptance */}
      <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-4">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {t("register.termsPrefix")}{" "}
          <a href="/terms" className="text-blue-600 hover:text-blue-700 underline">
            {t("register.termsOfService")}
          </a>{" "}
          {t("register.and")}{" "}
          <a href="/privacy" className="text-blue-600 hover:text-blue-700 underline">
            {t("register.privacyPolicy")}
          </a>
          .
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex justify-between pt-6">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 dark:disabled:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold py-2 px-8 rounded-lg transition duration-200"
        >
          {t("register.back")}
        </button>
        <button
          type="submit"
          disabled={isLoading || !isFormValid}
          className="bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-200 disabled:text-slate-400 disabled:hover:bg-slate-200 disabled:cursor-not-allowed dark:disabled:bg-slate-700 dark:disabled:text-slate-500 font-semibold py-2 px-8 rounded-lg transition duration-200"
        >
          {isLoading ? t("register.creatingAccount") : t("register.completeRegistration")}
        </button>
      </div>
    </form>
  );
};

export default AdminAccountForm;
