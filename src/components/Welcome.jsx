/**
 * Welcome — pre-test welcome screen with optional form fields.
 */

import React, { useState } from 'react';
import {
  Box, Button, Container, MenuItem, Paper, Select,
  TextField, Typography,
} from '@mui/material';
import ReactMarkdown from 'react-markdown';

/**
 * @param {object} props
 * @param {string} [props.description] - Markdown description
 * @param {object[]} [props.form] - Form field definitions
 * @param {boolean} props.initialized - Whether audio is loaded
 * @param {(formData: object) => void} props.onStart
 */
export default function Welcome({ description, form, initialized, onStart }) {
  const [formData, setFormData] = useState(() => {
    const initial = {};
    if (form) {
      for (const field of form) {
        initial[field.name] = '';
      }
    }
    return initial;
  });

  const isFormValid = () => {
    if (!form) return true;
    return form.every((field) => formData[field.name] !== '');
  };

  const handleChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleStart = () => {
    if (!initialized || !isFormValid()) return;
    onStart(formData);
  };

  return (
    <Box sx={{ backgroundColor: '#f6f6f6', minHeight: '100vh' }} pt={2} pb={2}>
      <Container maxWidth="sm">
        <Paper>
          <Box p={3}>
            {description && (
              <Box mb={3}>
                <ReactMarkdown>{description}</ReactMarkdown>
              </Box>
            )}

            {form && form.length > 0 && (
              <Box mb={3}>
                {form.map((field) => (
                  <Box key={field.name} mb={2}>
                    <Typography variant="subtitle2" gutterBottom>
                      {field.name}
                    </Typography>
                    {field.inputType === 'select' ? (
                      <Select
                        value={formData[field.name]}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                        fullWidth
                        size="small"
                        displayEmpty
                      >
                        <MenuItem value="" disabled>
                          Select...
                        </MenuItem>
                        {(field.options || []).map((opt) => (
                          <MenuItem key={opt} value={opt}>
                            {opt}
                          </MenuItem>
                        ))}
                      </Select>
                    ) : (
                      <TextField
                        value={formData[field.name]}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                        type={field.inputType === 'number' ? 'number' : 'text'}
                        fullWidth
                        size="small"
                      />
                    )}
                  </Box>
                ))}
              </Box>
            )}

            <Box display="flex" justifyContent="center">
              <Button
                variant="contained"
                color="primary"
                onClick={handleStart}
                disabled={!initialized || !isFormValid()}
                size="large"
              >
                {initialized ? 'Start!' : 'Loading audio...'}
              </Button>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
