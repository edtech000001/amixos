Pod::Spec.new do |s|
  s.name           = 'LiveText'
  s.version        = '1.0.0'
  s.summary        = 'Apple Live Text (select / copy text) on full-screen photos'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'Amixos'
  s.homepage       = 'https://amixos.com'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
