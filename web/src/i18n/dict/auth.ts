import { Locale } from '../locales';

export type AuthDict = {
  brand: { name: string };
  login: {
    tagline: string;
    heading: string;
    dividerEmail: string;
    forgotPassword: string;
    submit: string;
    noAccount: string;
    registerHere: string;
    urlError: string;
    connectionError: string;
    errors: {
      emailNotConfirmed: string;
      invalidCredentials: string;
      tooManyRequests: string;
      userNotFound: string;
      generic: string;
      emailInvalid: string;
      passwordShort: string;
    };
  };
  register: {
    tagline: string;
    heading: string;
    sub: string;
    dividerEmail: string;
    firstName: string;
    firstNamePlaceholder: string;
    lastName: string;
    lastNamePlaceholder: string;
    email: string;
    emailPlaceholder: string;
    password: string;
    passwordPlaceholder: string;
    confirmPassword: string;
    confirmPasswordPlaceholder: string;
    verificationNote: string;
    submit: string;
    termsBefore: string;
    terms: string;
    termsAnd: string;
    privacy: string;
    alreadyAccount: string;
    loginHere: string;
    errors: {
      firstNameRequired: string;
      lastNameRequired: string;
      emailInvalid: string;
      passwordShort: string;
      passwordMismatch: string;
      alreadyRegistered: string;
      generic: string;
    };
  };
  forgot: {
    tagline: string;
    heading: string;
    sub: string;
    email: string;
    emailPlaceholder: string;
    submit: string;
    backToLogin: string;
    successTitle: string;
    successSub: string;
    error: string;
    emailInvalid: string;
  };
  oauth: {
    continueWith: string;
    registerWith: string;
  };
};

export const auth: Record<Locale, AuthDict> = {
  es: {
    brand: { name: 'Amixos' },
    login: {
      tagline: 'Bienvenido de vuelta. A darle.',
      heading: 'Entra a tu cuenta',
      dividerEmail: 'o continúa con correo',
      forgotPassword: '¿Olvidaste tu contraseña?',
      submit: 'Iniciar Sesión',
      noAccount: '¿No tienes cuenta?',
      registerHere: 'Regístrate gratis',
      urlError: 'Algo salió mal con la verificación. Intenta iniciar sesión o registrarte de nuevo.',
      connectionError: 'Error de conexión. Verifica tu internet e intenta de nuevo.',
      errors: {
        emailNotConfirmed: 'Correo no está verificado. Revisa tu correo 📧',
        invalidCredentials: 'Correo o contraseña incorrectos. Intenta de nuevo.',
        tooManyRequests: 'Demasiados intentos. Espera un momento e intenta de nuevo.',
        userNotFound: 'No existe una cuenta con ese correo.',
        generic: 'Algo salió mal. Intenta de nuevo.',
        emailInvalid: 'Ingresa un correo válido',
        passwordShort: 'La contraseña debe tener al menos 6 caracteres',
      },
    },
    register: {
      tagline: 'Construye tu negocio. Maneja tu equipo.',
      heading: 'Crea tu cuenta',
      sub: '30 días gratis. Sin tarjeta de crédito.',
      dividerEmail: 'o regístrate con correo',
      firstName: 'Nombre',
      firstNamePlaceholder: 'Carlos',
      lastName: 'Apellido',
      lastNamePlaceholder: 'Mendoza',
      email: 'Correo',
      emailPlaceholder: 'tu@correo.com',
      password: 'Contraseña',
      passwordPlaceholder: 'Mínimo 8 caracteres',
      confirmPassword: 'Confirmar contraseña',
      confirmPasswordPlaceholder: '••••••••',
      verificationNote: '📧 Al registrarte recibirás un correo de verificación. Revísalo antes de iniciar sesión.',
      submit: 'Crear Cuenta',
      termsBefore: 'Al registrarte aceptas nuestros',
      terms: 'Términos',
      termsAnd: 'y',
      privacy: 'Política de privacidad',
      alreadyAccount: '¿Ya tienes cuenta?',
      loginHere: 'Entra aquí',
      errors: {
        firstNameRequired: 'Nombre requerido',
        lastNameRequired: 'Apellido requerido',
        emailInvalid: 'Ingresa un correo válido',
        passwordShort: 'La contraseña debe tener al menos 8 caracteres',
        passwordMismatch: 'Las contraseñas no coinciden',
        alreadyRegistered: 'Ya existe una cuenta con ese correo. ¿Quieres iniciar sesión?',
        generic: 'Algo salió mal. Intenta de nuevo.',
      },
    },
    forgot: {
      tagline: 'Recupera tu acceso',
      heading: '¿Olvidaste tu contraseña?',
      sub: 'Ingresa tu correo y te mandamos un enlace para restablecerla.',
      email: 'Correo',
      emailPlaceholder: 'tu@correo.com',
      submit: 'Enviar enlace',
      backToLogin: 'Volver al inicio de sesión',
      successTitle: '¡Revisa tu correo!',
      successSub: 'Te enviamos un enlace para restablecer tu contraseña. Si no lo ves, revisa tu carpeta de spam.',
      error: 'Algo salió mal. Verifica el correo e intenta de nuevo.',
      emailInvalid: 'Ingresa un correo válido',
    },
    oauth: {
      continueWith: 'Continuar con',
      registerWith: 'Registrarse con',
    },
  },
  en: {
    brand: { name: 'Amixos' },
    login: {
      tagline: 'Welcome back. Let\'s get to it.',
      heading: 'Sign in to your account',
      dividerEmail: 'or continue with email',
      forgotPassword: 'Forgot your password?',
      submit: 'Sign In',
      noAccount: "Don't have an account?",
      registerHere: 'Sign up free',
      urlError: 'Something went wrong with verification. Try signing in or registering again.',
      connectionError: 'Connection error. Check your internet and try again.',
      errors: {
        emailNotConfirmed: 'Email not verified. Check your inbox 📧',
        invalidCredentials: 'Incorrect email or password. Try again.',
        tooManyRequests: 'Too many attempts. Wait a moment and try again.',
        userNotFound: 'No account exists with that email.',
        generic: 'Something went wrong. Try again.',
        emailInvalid: 'Enter a valid email',
        passwordShort: 'Password must be at least 6 characters',
      },
    },
    register: {
      tagline: 'Build your business. Manage your team.',
      heading: 'Create your account',
      sub: '30 days free. No credit card required.',
      dividerEmail: 'or sign up with email',
      firstName: 'First name',
      firstNamePlaceholder: 'Carlos',
      lastName: 'Last name',
      lastNamePlaceholder: 'Mendoza',
      email: 'Email',
      emailPlaceholder: 'you@example.com',
      password: 'Password',
      passwordPlaceholder: 'At least 8 characters',
      confirmPassword: 'Confirm password',
      confirmPasswordPlaceholder: '••••••••',
      verificationNote: "📧 You'll get a verification email when you sign up. Check it before signing in.",
      submit: 'Create Account',
      termsBefore: 'By signing up you agree to our',
      terms: 'Terms',
      termsAnd: 'and',
      privacy: 'Privacy Policy',
      alreadyAccount: 'Already have an account?',
      loginHere: 'Sign in here',
      errors: {
        firstNameRequired: 'First name required',
        lastNameRequired: 'Last name required',
        emailInvalid: 'Enter a valid email',
        passwordShort: 'Password must be at least 8 characters',
        passwordMismatch: 'Passwords do not match',
        alreadyRegistered: 'An account already exists with that email. Want to sign in?',
        generic: 'Something went wrong. Try again.',
      },
    },
    forgot: {
      tagline: 'Recover your access',
      heading: 'Forgot your password?',
      sub: "Enter your email and we'll send you a link to reset it.",
      email: 'Email',
      emailPlaceholder: 'you@example.com',
      submit: 'Send link',
      backToLogin: 'Back to sign in',
      successTitle: 'Check your email!',
      successSub: "We sent you a link to reset your password. If you don't see it, check your spam folder.",
      error: 'Something went wrong. Check the email and try again.',
      emailInvalid: 'Enter a valid email',
    },
    oauth: {
      continueWith: 'Continue with',
      registerWith: 'Sign up with',
    },
  },
};
