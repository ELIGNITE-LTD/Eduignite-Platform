from setuptools import setup, find_packages

setup(
    name='eduignite',
    version='1.0.0',
    description='EduIgnite School Management Platform',
    author='EduIgnite Team',
    author_email='eduignitecmr@gmail.com',
    url='https://eduignite.com',
    packages=find_packages(),
    include_package_data=True,
    python_requires='>=3.11',
    classifiers=[
        'Development Status :: 4 - Beta',
        'Framework :: Django',
        'Framework :: Django :: 4.2',
        'Intended Audience :: Education',
        'License :: OSI Approved :: MIT License',
        'Programming Language :: Python',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.11',
    ],
)
