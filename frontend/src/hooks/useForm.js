import { useState, useCallback } from "react";
export function useForm(initialValues = {}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const setField = useCallback((field, value) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    // Clear error when field changes
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }, [errors]);
  const setFields = useCallback((patch) => {
    setValues((prev) => ({ ...prev, ...patch }));
  }, []);
  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
  }, [initialValues]);
  const validate = useCallback((rules) => {
    const newErrors = {};
    for (const [field, rule] of Object.entries(rules)) {
      const value = values[field];//john
      const result = rule(value, values);
      if (result) {
        newErrors[field] = result;
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [values]);
  return { values, errors, setField, setFields, reset, validate, setErrors };
}