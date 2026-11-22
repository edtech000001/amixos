Pod::Spec.new do |s|
  s.name           = 'AmiCallNative'
  s.version        = '1.0.0'
  s.summary        = 'Bridge between the Ami voice call and iOS (Live Activity, Siri).'
  s.description    = s.summary
  s.author         = 'Amixos'
  s.homepage       = 'https://amixos.com'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = '**/*.{h,m,swift}'
end
